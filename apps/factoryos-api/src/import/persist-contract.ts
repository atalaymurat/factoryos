import type { Transaction } from "kysely";
import type { DB, JsonObject } from "../db/types.generated.js";
import type { PartContract } from "../contracts/part_contract.js";

/**
 * Part Contract → MES tabloları (atomic insert).
 *
 * Çağrı disiplini: caller `db.transaction().execute(async (trx) => persistContract(trx, c))`
 * ile sarmalı. Bu fonksiyon transaction yönetmez — tek bir hata bile rollback
 * tetiklesin diye dış scope'a bırakır.
 *
 * Şu an Adım 3: project + work_order. Sonraki adımlarda materials/edge_bands
 * (Adım 4) ve modules/sub_modules/parts/edges/operations (Adım 5) eklenecek.
 *
 * Idempotency:
 *  - project: kod varsa mevcut row kullanılır (update yok — kaynak sistem
 *    project bilgisini ezmesin diye; supervisor UI'dan elle düzeltilir)
 *  - work_order: kod ÇAKIŞIRSA `DuplicateWorkOrderError` fırlatılır
 *    (caller bunu 409'a çevirir). Re-import desteklemiyoruz; revize akışı v3'te.
 */

export class DuplicateWorkOrderError extends Error {
  constructor(public readonly code: string) {
    super(`work_order already exists: ${code}`);
    this.name = "DuplicateWorkOrderError";
  }
}

export interface PersistResult {
  project_id: string;
  work_order_id: string;
  counts: {
    materials: number;
    edge_bands: number;
    modules: number;
    sub_modules: number;
    parts: number;
  };
}

async function upsertProject(
  trx: Transaction<DB>,
  contract: PartContract,
): Promise<string> {
  const existing = await trx
    .selectFrom("projects")
    .select("id")
    .where("code", "=", contract.project.code)
    .executeTakeFirst();
  if (existing) return existing.id;

  // IMOS sample'da customer bilgisi work_order'a yazıyor ama project tablosunda
  // da var. Project ilk kez yaratılırken aynı bilgiyi paralel doldur — supervisor
  // UI farklı projeler için filtreleyebilsin.
  const inserted = await trx
    .insertInto("projects")
    .values({
      code: contract.project.code,
      name: contract.project.name,
      type: contract.project.type,
      customer_name: contract.work_order.customer_name,
      customer_address: contract.work_order.customer_address,
      // metadata = jsonb. Zod `z.record(z.string(), z.unknown())` döndürür;
      // Kysely JsonObject bekliyor. Runtime'da pg driver POJO'yu jsonb'a
      // serialize eder — sadece TS'i ikna etmek için cast.
      metadata: contract.project.metadata as JsonObject,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

async function insertWorkOrder(
  trx: Transaction<DB>,
  contract: PartContract,
  projectId: string,
): Promise<string> {
  const dup = await trx
    .selectFrom("work_orders")
    .select("id")
    .where("code", "=", contract.work_order.code)
    .executeTakeFirst();
  if (dup) throw new DuplicateWorkOrderError(contract.work_order.code);

  const inserted = await trx
    .insertInto("work_orders")
    .values({
      code: contract.work_order.code,
      customer_name: contract.work_order.customer_name,
      priority: contract.work_order.priority,
      planned_start_date: contract.work_order.planned_start_date,
      planned_end_date: contract.work_order.planned_end_date,
      notes: contract.work_order.notes,
      project_ids: [projectId],
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

export async function persistContract(
  trx: Transaction<DB>,
  contract: PartContract,
): Promise<PersistResult> {
  const projectId = await upsertProject(trx, contract);
  const workOrderId = await insertWorkOrder(trx, contract, projectId);

  return {
    project_id: projectId,
    work_order_id: workOrderId,
    counts: {
      materials: 0, // Adım 4
      edge_bands: 0, // Adım 4
      modules: 0, // Adım 5
      sub_modules: 0, // Adım 5
      parts: 0, // Adım 5
    },
  };
}
