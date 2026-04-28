import type { ImosPart } from "../types.js";
import { findPartSubelements, nullIfBlank } from "../utils.js";
import { logger } from "../../../lib/logger.js";
import type { ContractOperation } from "./_route.js";

/**
 * IMOS Type 9 (program) → operations[].details.programs[]
 *
 * Programs part'ın 1 seviye derin subelement'ı (parent.ID = part.ID,
 * fixture'da 806/806 eşleşiyor). Her program bir CNC dosyasına karşılık gelir.
 *
 * Match: program.MachineID === operation.preferred_machine_code.
 * Her iki taraf da "{id}_{model}" formatında (örn "10303_BHX560") —
 * _route.ts machine code üretimiyle simetrik.
 *
 * Çoklu match: aynı makineye giden tüm programlar tek operation'ın
 * details.programs[]'ına push edilir. Route aynı makineyi iki kez listelerse
 * ilk eşleşen op kullanılır (defansif; pratikte tekrar nadir).
 *
 * Eşleşmeyen program: dönüş array'ine eklenir + warn loglanır. Veri kaybolmaz;
 * IMOS'un bazı durumlarda rotada listelemediği alternatif makineler için
 * CNC dosyası üretebildiği gözlemlendi (saha bilgisi). Bu programlar part-level
 * `programs_unmatched[]` alanında tutulur.
 *
 * Tail ops (assembly/packaging) preferred_machine_code = null; aday değil.
 */

interface RawImosProgram {
  ID?: string;
  MachineID?: string;
  MachineNcNumber?: string;
  MachineBarcode?: string;
  CncName?: string;
  FilePath?: string;
  Workflow?: string;
  SubPartId?: string;
  MirrorTopBottom?: string;
  TransferDate?: string;
}

export interface ContractProgram {
  nc_number: string | null;
  barcode: string | null;
  cnc_name: string | null;
  file_path: string | null;
  workflow: string | null;
  sub_part_id: string | null;
  mirror_top_bottom: boolean;
  source: { id: string | null; transfer_date: string | null };
}

function toContractProgram(p: RawImosProgram): ContractProgram {
  return {
    nc_number: nullIfBlank(p.MachineNcNumber),
    barcode: nullIfBlank(p.MachineBarcode),
    cnc_name: nullIfBlank(p.CncName),
    file_path: nullIfBlank(p.FilePath),
    workflow: nullIfBlank(p.Workflow),
    sub_part_id: nullIfBlank(p.SubPartId),
    mirror_top_bottom: (p.MirrorTopBottom ?? "").trim() === "1",
    source: {
      id: nullIfBlank(p.ID),
      transfer_date: nullIfBlank(p.TransferDate),
    },
  };
}

export function attachProgramsToOperations(
  part: ImosPart,
  operations: ContractOperation[],
): ContractProgram[] {
  const programs = findPartSubelements<RawImosProgram>(part, "program");
  const unmatched: ContractProgram[] = [];
  if (programs.length === 0) return unmatched;

  for (const program of programs) {
    const machineCode = nullIfBlank(program.MachineID);
    if (!machineCode) {
      // MachineID hiç yoksa hangi op'a bağlayacağımızı bilemeyiz, ama
      // veriyi kaybetmemek için unmatched listesine yine de koyarız.
      logger.warn(
        { part_id: part.ID, program_id: program.ID },
        "imos: program missing MachineID — kept as unmatched",
      );
      unmatched.push(toContractProgram(program));
      continue;
    }
    const op = operations.find(
      (o) => o.preferred_machine_code === machineCode,
    );
    if (!op) {
      logger.warn(
        {
          part_id: part.ID,
          program_id: program.ID,
          machine: machineCode,
        },
        "imos: program machine not in route — kept as unmatched (alternative?)",
      );
      unmatched.push(toContractProgram(program));
      continue;
    }
    const list =
      (op.details.programs as ContractProgram[] | undefined) ?? [];
    list.push(toContractProgram(program));
    op.details.programs = list;
  }
  return unmatched;
}
