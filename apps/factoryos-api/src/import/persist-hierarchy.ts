import type { Transaction } from "kysely";
import type { DB, JsonObject } from "../db/types.generated.js";
import type { PartContract } from "../contracts/part_contract.js";

/**
 * Part Contract → MES hiyerarşi tabloları (modules → sub_modules → parts →
 * part_edges → part_operations).
 *
 * Çağrı disiplini: caller transaction yönetir, projectId ve workOrderId
 * `persist-contract.ts` tarafından üretilip iletilir. Bu dosya sadece
 * hiyerarşi tablolarına yazar; project/work_order/materials/edge_bands
 * orchestrator'da kalır.
 *
 * Idempotency notu: hiyerarşi her import için TAZE insert. Re-import yok —
 * `work_order.code` çakışırsa orchestrator 409 döner, transaction rollback
 * eder ve hiyerarşi de geri alınır. Bu yüzden burada ON CONFLICT yok.
 *
 * Code → id map'leri: modules.code modül seviyesinde unique (project içinde),
 * sub_modules.code module içinde unique. Adapter hierarchical code üretir
 * ({project}-M{NN}, {module}-S{NN}, {sub_module}-P{NN}) — global çakışma yok.
 */

export interface HierarchyResult {
  modules: number;
  sub_modules: number;
  parts: number;
  part_edges: number;
  part_operations: number;
}

async function persistModules(
  trx: Transaction<DB>,
  contract: PartContract,
  projectId: string,
): Promise<Map<string, string>> {
  if (contract.modules.length === 0) return new Map();

  const inserted = await trx
    .insertInto("modules")
    .values(
      contract.modules.map((m) => ({
        project_id: projectId,
        code: m.code,
        name: m.name,
        module_type: m.module_type,
        article_number: m.article_number,
        construction_principle: m.construction_principle,
        // dimensions JSONB — Zod nullable üçlü, DB NOT NULL DEFAULT '{}'.
        // Bütün üçlüsü null bile olsa boş obje yerine yapıyı koruyoruz —
        // UI tarafında "ölçü hiç gelmemiş" ile "ölçüler null" ayrımı kalsın.
        dimensions: m.dimensions as unknown as JsonObject,
        weight_kg: m.weight_kg,
        is_assembled_at_factory: m.is_assembled_at_factory,
        metadata: m.metadata as JsonObject,
      })),
    )
    .returning(["id", "code"])
    .execute();

  return new Map(inserted.map((r) => [r.code, r.id]));
}

async function persistSubModules(
  trx: Transaction<DB>,
  contract: PartContract,
  moduleIds: Map<string, string>,
): Promise<Map<string, string>> {
  if (contract.sub_modules.length === 0) return new Map();

  const rows = contract.sub_modules.map((s) => {
    const moduleId = moduleIds.get(s.module_code);
    if (!moduleId) {
      // Adapter orchestrator'ı bu invariant'ı garanti eder ama defensive:
      // contract Zod parse'ı geçmiş olsa bile mantıksal tutarlılık burada görülür.
      throw new Error(
        `sub_module ${s.code} references unknown module_code ${s.module_code}`,
      );
    }
    return {
      module_id: moduleId,
      code: s.code,
      name: s.name,
      sequence: s.sequence,
      metadata: s.metadata as JsonObject,
    };
  });

  const inserted = await trx
    .insertInto("sub_modules")
    .values(rows)
    .returning(["id", "code"])
    .execute();

  return new Map(inserted.map((r) => [r.code, r.id]));
}

// Bir tabloda code → id eşlemesi kurar. Materials/edge_bands ON CONFLICT DO
// NOTHING ile insert edildiği için RETURNING sadece yeni satırları verir;
// re-import'ta veya kısmen mevcut katalogda eksik kalır. Bu helper TÜM
// referans verilen code'lar için DB'den gerçek id'leri çeker — tek noktadan.
async function fetchCodeIdMap(
  trx: Transaction<DB>,
  table: "materials" | "edge_bands" | "machines",
  codes: string[],
): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const unique = Array.from(new Set(codes));
  const rows = await trx
    .selectFrom(table)
    .select(["id", "code"])
    .where("code", "in", unique)
    .execute();
  return new Map(rows.map((r) => [r.code, r.id]));
}

async function persistParts(
  trx: Transaction<DB>,
  contract: PartContract,
  projectId: string,
  moduleIds: Map<string, string>,
  subModuleIds: Map<string, string>,
): Promise<Map<string, string>> {
  if (contract.parts.length === 0) return new Map();

  // material_code referanslarını topla → tek SELECT ile id map'i kur.
  // Hardware parçalar (part_type=purchased_stock) genelde material_code=null;
  // filterMap zaten null'ları atar.
  const materialCodes = contract.parts
    .map((p) => p.material_code)
    .filter((c): c is string => c !== null);
  const materialIds = await fetchCodeIdMap(trx, "materials", materialCodes);

  const rows = contract.parts.map((p) => {
    const moduleId = moduleIds.get(p.module_code);
    if (!moduleId) {
      throw new Error(
        `part ${p.code} references unknown module_code ${p.module_code}`,
      );
    }
    // Contract'ta sub_module_code zorunlu (z.string().min(1)) — DB nullable
    // ama bugün her zaman dolu gelir. Eksik gelirse (ileride contract gevşerse)
    // null geçilir; şimdilik bilinmeyen kod hata sayılır.
    const subModuleId = subModuleIds.get(p.sub_module_code);
    if (!subModuleId) {
      throw new Error(
        `part ${p.code} references unknown sub_module_code ${p.sub_module_code}`,
      );
    }
    // material_code dolu ama materials tablosunda yoksa: katalog ile
    // contract uyumsuz — sessizce null geçmek yerine erken patla.
    let materialId: string | null = null;
    if (p.material_code !== null) {
      const found = materialIds.get(p.material_code);
      if (!found) {
        throw new Error(
          `part ${p.code} references unknown material_code ${p.material_code}`,
        );
      }
      materialId = found;
    }
    return {
      project_id: projectId,
      module_id: moduleId,
      sub_module_id: subModuleId,
      code: p.code,
      article_number: p.article_number,
      description: p.description,
      part_type: p.part_type,
      quantity: p.quantity,
      barcodes: p.barcodes as unknown as JsonObject,
      // dimensions nullable in contract — DB NOT NULL DEFAULT '{}'.
      // Null gelirse boş obje yaz; UI "ölçü yok" durumunu boş objeden anlar.
      dimensions: (p.dimensions ?? {}) as unknown as JsonObject,
      material_id: materialId,
      grain_orientation_degrees: p.grain_orientation_degrees,
      supplier: (p.supplier ?? {}) as unknown as JsonObject,
      flags: p.flags as unknown as JsonObject,
      metadata: p.metadata as JsonObject,
    };
  });

  const inserted = await trx
    .insertInto("parts")
    .values(rows)
    .returning(["id", "code"])
    .execute();

  return new Map(inserted.map((r) => [r.code, r.id]));
}

async function persistPartEdges(
  trx: Transaction<DB>,
  contract: PartContract,
  partIds: Map<string, string>,
): Promise<number> {
  // Tüm part'ların edges[]'ini düzleştir; çoğu hardware part'ında boş.
  const allEdges = contract.parts.flatMap((p) =>
    p.edges.map((e) => ({ partCode: p.code, edge: e })),
  );
  if (allEdges.length === 0) return 0;

  const edgeBandCodes = allEdges.map((x) => x.edge.edge_band_code);
  const edgeBandIds = await fetchCodeIdMap(trx, "edge_bands", edgeBandCodes);

  const rows = allEdges.map(({ partCode, edge }) => {
    const partId = partIds.get(partCode);
    if (!partId) {
      // persistParts başarılı olduysa imkansız — invariant kontrolü.
      throw new Error(`part_edge references missing part_code ${partCode}`);
    }
    const edgeBandId = edgeBandIds.get(edge.edge_band_code);
    if (!edgeBandId) {
      throw new Error(
        `part_edge on ${partCode} references unknown edge_band_code ${edge.edge_band_code}`,
      );
    }
    // side contract'ta nullable; DB NOT NULL. Adapter "long_edge" varsayılanı
    // garanti ediyor (parsers/_part-edges.ts), null gelirse erken patla.
    if (edge.side === null) {
      throw new Error(
        `part_edge on ${partCode} has null side — adapter invariant broken`,
      );
    }
    return {
      part_id: partId,
      edge_band_id: edgeBandId,
      sequence: edge.sequence,
      side: edge.side,
      machining_sides: edge.machining_sides ?? 0,
    };
  });

  const inserted = await trx
    .insertInto("part_edges")
    .values(rows)
    .returning("id")
    .execute();

  return inserted.length;
}

async function persistPartOperations(
  trx: Transaction<DB>,
  contract: PartContract,
  partIds: Map<string, string>,
): Promise<number> {
  const allOps = contract.parts.flatMap((p) =>
    p.operations.map((op) => ({ partCode: p.code, op })),
  );
  if (allOps.length === 0) return 0;

  // Tüm makine kodlarını topla — preferred + alternatives. Adım 2'de FK
  // validation geçti, yani DB'de hepsi var. Sadece id map'i çıkar.
  const machineCodes: string[] = [];
  for (const { op } of allOps) {
    if (op.preferred_machine_code !== null) {
      machineCodes.push(op.preferred_machine_code);
    }
    machineCodes.push(...op.alternative_machine_codes);
  }
  const machineIds = await fetchCodeIdMap(trx, "machines", machineCodes);

  const rows = allOps.map(({ partCode, op }) => {
    const partId = partIds.get(partCode);
    if (!partId) {
      throw new Error(`part_operation references missing part_code ${partCode}`);
    }
    let preferredMachineId: string | null = null;
    if (op.preferred_machine_code !== null) {
      const found = machineIds.get(op.preferred_machine_code);
      if (!found) {
        // Adım 2 validation kaçırmış olamaz — savunma amaçlı.
        throw new Error(
          `unknown preferred_machine_code ${op.preferred_machine_code} on ${partCode}`,
        );
      }
      preferredMachineId = found;
    }
    const alternativeIds = op.alternative_machine_codes.map((code) => {
      const found = machineIds.get(code);
      if (!found) {
        throw new Error(
          `unknown alternative_machine_code ${code} on ${partCode}`,
        );
      }
      return found;
    });
    return {
      part_id: partId,
      sequence: op.sequence,
      phase: op.phase,
      station: op.station,
      preferred_machine_id: preferredMachineId,
      alternative_machine_ids: alternativeIds,
      required_capabilities: op.required_capabilities,
      required: op.required,
      details: op.details as JsonObject,
    };
  });

  const inserted = await trx
    .insertInto("part_operations")
    .values(rows)
    .returning("id")
    .execute();

  return inserted.length;
}

export async function persistHierarchy(
  trx: Transaction<DB>,
  contract: PartContract,
  projectId: string,
): Promise<HierarchyResult> {
  const moduleIds = await persistModules(trx, contract, projectId);
  const subModuleIds = await persistSubModules(trx, contract, moduleIds);
  const partIds = await persistParts(
    trx,
    contract,
    projectId,
    moduleIds,
    subModuleIds,
  );
  const partEdgesCount = await persistPartEdges(trx, contract, partIds);
  const partOpsCount = await persistPartOperations(trx, contract, partIds);

  return {
    modules: moduleIds.size,
    sub_modules: subModuleIds.size,
    parts: partIds.size,
    part_edges: partEdgesCount,
    part_operations: partOpsCount,
  };
}
