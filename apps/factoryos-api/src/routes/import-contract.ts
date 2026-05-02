import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import {
  partContractSchema,
  type PartContract,
} from "../contracts/part_contract.js";
import { db } from "../db/client.js";
import { logger } from "../lib/logger.js";
import {
  persistContract,
  DuplicateWorkOrderError,
} from "../import/persist-contract.js";

/**
 * POST /api/v1/import/contract
 *
 * Adapter'dan gelen Part Contract v2 JSON'u kabul eder, doğrular ve atomic
 * transaction ile MES tablolarına yazar. Üst düzey akış:
 *
 *   1. Body Zod parse  → schema mismatch ise 422
 *   2. Catalog FK validation (machines + stations) → bilinmeyen kodda 422
 *   3. Idempotency check (work_order.code) → çakışmada 409
 *   4. Atomic insert (BEGIN/COMMIT) → tek hata = tam rollback
 *   5. Response: created entity counts
 *
 * Defense in depth: schema parse zaten adapter exit'inde de çalışıyor
 * (parseImosContract). Burada tekrar uygulanır çünkü manuel CSV upload veya
 * doğrudan POST gibi adapter'sız yollar da var.
 */

export const importContractRouter = Router();

interface ValidationErrorBody {
  error: string;
  issues: Array<{ path: string; message: string; code: string }>;
}

function zodErrorToBody(err: ZodError): ValidationErrorBody {
  return {
    error: "validation_failed",
    issues: err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    })),
  };
}

// Contract'taki tüm machine code referanslarını topla (preferred + alternatives).
// Null değerler ve boş string'ler atlanır — schema bunları zaten kabul ediyor.
function collectMachineCodes(contract: PartContract): Set<string> {
  const codes = new Set<string>();
  for (const part of contract.parts) {
    for (const op of part.operations) {
      if (op.preferred_machine_code) codes.add(op.preferred_machine_code);
      for (const alt of op.alternative_machine_codes) {
        if (alt) codes.add(alt);
      }
    }
  }
  return codes;
}

// MES catalog FK kontrolü: contract'taki her machine code mes.machines.code'da
// var mı? Eksik kod = veri tutarsızlığı (catalog güncel değil veya adapter
// bug'lı). Tüm eksik liste dönülür ki supervisor tek seferde düzeltsin.
async function findUnknownMachineCodes(
  referenced: Set<string>,
): Promise<string[]> {
  if (referenced.size === 0) return [];
  const rows = await db
    .selectFrom("machines")
    .select("code")
    .where("code", "in", [...referenced])
    .execute();
  const known = new Set(rows.map((r) => r.code));
  return [...referenced].filter((c) => !known.has(c));
}

importContractRouter.post(
  "/api/v1/import/contract",
  async (req: Request, res: Response) => {
    let contract: ReturnType<typeof partContractSchema.parse>;
    try {
      contract = partContractSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        logger.warn(
          { issue_count: err.issues.length, first_path: err.issues[0]?.path.join(".") },
          "import: schema validation failed",
        );
        res.status(422).json(zodErrorToBody(err));
        return;
      }
      throw err; // beklenmedik
    }

    // Catalog FK validation: machine code'ların hepsi mes.machines'de olmalı.
    // Yoksa import reject — partial accept yapmıyoruz (atomicity prensibi).
    const referenced = collectMachineCodes(contract);
    const unknown = await findUnknownMachineCodes(referenced);
    if (unknown.length > 0) {
      logger.warn(
        {
          work_order: contract.work_order.code,
          unknown_count: unknown.length,
          referenced_count: referenced.size,
        },
        "import: unknown machine codes — reject",
      );
      res.status(422).json({
        error: "unknown_machine_codes",
        message:
          "Bazı machine code'lar MES catalog'unda yok. Bootstrap CLI eksik mi, " +
          "veya catalog güncel değil mi? Supervisor UI'dan ekleyin.",
        unknown_machine_codes: unknown,
        referenced_count: referenced.size,
      });
      return;
    }

    // Atomic insert (BEGIN/COMMIT). persistContract içindeki herhangi bir
    // hata transaction'ı rollback eder — partial import yok.
    try {
      const result = await db.transaction().execute(async (trx) => {
        return persistContract(trx, contract);
      });
      logger.info(
        {
          work_order: contract.work_order.code,
          project_id: result.project_id,
          work_order_id: result.work_order_id,
        },
        "import: contract persisted",
      );
      res.status(201).json({
        status: "created",
        work_order_code: contract.work_order.code,
        work_order_id: result.work_order_id,
        project_id: result.project_id,
        counts: result.counts,
        machine_codes_validated: referenced.size,
      });
    } catch (err) {
      if (err instanceof DuplicateWorkOrderError) {
        logger.warn(
          { work_order: err.code },
          "import: duplicate work_order — reject",
        );
        res.status(409).json({
          error: "duplicate_work_order",
          message: `work_order code already imported: ${err.code}`,
          work_order_code: err.code,
        });
        return;
      }
      throw err;
    }
  },
);
