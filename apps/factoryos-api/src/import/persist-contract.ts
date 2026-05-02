import type { Transaction } from "kysely";
import type { DB, JsonObject } from "../db/types.generated.js";
import type { PartContract } from "../contracts/part_contract.js";
import { persistHierarchy } from "./persist-hierarchy.js";

/**
 * Part Contract → MES tabloları (atomic insert).
 *
 * Çağrı disiplini: caller `db.transaction().execute(async (trx) => persistContract(trx, c))`
 * ile sarmalı. Bu fonksiyon transaction yönetmez — tek bir hata bile rollback
 * tetiklesin diye dış scope'a bırakır.
 *
 * Şu an Adım 4: project + work_order + materials + edge_bands. Sonraki adımda
 * modules/sub_modules/parts/edges/operations (Adım 5) eklenecek.
 *
 * Idempotency:
 *  - project: kod varsa mevcut row kullanılır (update yok — kaynak sistem
 *    project bilgisini ezmesin diye; supervisor UI'dan elle düzeltilir)
 *  - materials/edge_bands: ON CONFLICT (code) DO NOTHING — mevcut katalog
 *    row'una dokunulmaz. Adapter aynı code için farklı supplier/fiyat
 *    gönderirse göz ardı edilir; supervisor UI'dan elle güncellenir.
 *    counts.materials/edge_bands = bu çağrıda yeni eklenen satır sayısı
 *    (re-import'ta 0 görmek beklenen davranış).
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
    part_edges: number;
    part_operations: number;
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

async function persistMaterials(
  trx: Transaction<DB>,
  materials: PartContract["materials"],
): Promise<number> {
  if (materials.length === 0) return 0;

  // ON CONFLICT DO NOTHING: aynı code zaten varsa adapter'ın yeni supplier/fiyat
  // değerleri ezilmez (saha disiplini: katalog elle yönetilir, import'tan asla
  // güncellenmez). RETURNING sadece gerçekten insert edilen satırları döner;
  // skip edilen conflict row'lar listede yok — added sayısı = inserted.length.
  const inserted = await trx
    .insertInto("materials")
    .values(
      materials.map((m) => ({
        code: m.code,
        description: m.description,
        description_long: m.description_long,
        category: m.category,
        thickness_mm: m.thickness_mm,
        grain: m.grain,
        // supplier DB'de NOT NULL DEFAULT '{}'. Contract'ta nullable —
        // null gelirse boş obje yaz, schema invariant'ı koru.
        supplier: (m.supplier ?? {}) as JsonObject,
      })),
    )
    .onConflict((oc) => oc.column("code").doNothing())
    .returning("id")
    .execute();

  return inserted.length;
}

async function persistEdgeBands(
  trx: Transaction<DB>,
  edgeBands: PartContract["edge_bands"],
): Promise<number> {
  if (edgeBands.length === 0) return 0;

  const inserted = await trx
    .insertInto("edge_bands")
    .values(
      edgeBands.map((e) => ({
        code: e.code,
        description: e.description,
        material: e.material,
        color: e.color,
        thickness_mm: e.thickness_mm,
        geometry: e.geometry,
        supplier: (e.supplier ?? {}) as JsonObject,
      })),
    )
    .onConflict((oc) => oc.column("code").doNothing())
    .returning("id")
    .execute();

  return inserted.length;
}

export async function persistContract(
  trx: Transaction<DB>,
  contract: PartContract,
): Promise<PersistResult> {
  const projectId = await upsertProject(trx, contract);
  const workOrderId = await insertWorkOrder(trx, contract, projectId);
  const materialsAdded = await persistMaterials(trx, contract.materials);
  const edgeBandsAdded = await persistEdgeBands(trx, contract.edge_bands);
  const hierarchy = await persistHierarchy(trx, contract, projectId);

  return {
    project_id: projectId,
    work_order_id: workOrderId,
    counts: {
      materials: materialsAdded,
      edge_bands: edgeBandsAdded,
      modules: hierarchy.modules,
      sub_modules: hierarchy.sub_modules,
      parts: hierarchy.parts,
      part_edges: hierarchy.part_edges,
      part_operations: hierarchy.part_operations,
    },
  };
}
