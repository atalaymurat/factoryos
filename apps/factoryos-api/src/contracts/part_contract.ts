import { z } from "zod";

/**
 * Part Contract v2 — Zod schema (canonical source of truth).
 *
 * Adapter'lar (IMOS, Cabinet Vision, manuel CSV) bu yapıya uyan JSON üretir.
 * Validation iki yerde çalışır (defense in depth):
 *   1. Adapter exit'inde (`parseImosContract` çıkışı) — adapter bug'ı runtime'da yakalanır
 *   2. HTTP boundary'de (`POST /api/v1/import/contract` body) — dış girdi her zaman doğrulanır
 *
 * MES catalog (machines, stations) BU contract'a girmez — sadece kod ile referans
 * verilir. FK doğrulaması import endpoint'inde DB'ye karşı yapılır
 * (docs/adapters-reference.md § "MES Catalog Authority").
 *
 * Spec: docs/part_contract_v2.md. Bu dosya spec'in tip seviyesi karşılığıdır;
 * şüphede spec ile bu dosyayı senkronize tut.
 *
 * Boyut notu: bilinçli olarak ~150 satırı aşıyor. Schema bütünü tek dosyada
 * okunmalı (parça parça import etmek köprü modülleri çoğaltır). Bölünme ancak
 * iki ayrı contract çıkarsa (örn UNS event schema) gerçekleşir.
 */

// IMOS dates ISO YYYY-MM-DD'a çevrildi (DD.MM.YYYY input → utils/parseImosDate).
// Zod'da regex ile validate ederiz; geçersiz format adapter bug'ı işareti.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected ISO date (YYYY-MM-DD)");
const isoDateTime = z.string().datetime();

// ===== work_order + project =====

const workOrderSchema = z.object({
  code: z.string().min(1),
  customer_name: z.string().min(1),
  customer_address: z.string().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  planned_start_date: isoDate.nullable(),
  planned_end_date: isoDate.nullable(),
  notes: z.string().nullable(),
});

const projectSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["kitchen", "bathroom", "wardrobe", "shop", "other"]),
  metadata: z.record(z.string(), z.unknown()),
});

// ===== materials + edge_bands (catalogs adapter creates per-job) =====

const materialSupplierSchema = z.object({
  name: z.string().nullable(),
  purchase_order_number: z.string().nullable(),
  price_per_sheet: z.number().nullable(),
});

const materialSchema = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
  description_long: z.string().nullable(),
  category: z.string().nullable(),
  thickness_mm: z.number().positive().nullable(),
  grain: z.boolean(),
  supplier: materialSupplierSchema.nullable(),
});

const edgeBandSupplierSchema = z.object({
  name: z.string().nullable(),
  purchase_order_number: z.string().nullable(),
});

const edgeBandSchema = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
  material: z.string().nullable(),
  color: z.string().nullable(),
  thickness_mm: z.number().positive().nullable(),
  geometry: z.string().nullable(),
  supplier: edgeBandSupplierSchema.nullable(),
});

// ===== modules + sub_modules =====

const dimensionsSchema = z.object({
  length_mm: z.number().nullable(),
  width_mm: z.number().nullable(),
  depth_mm: z.number().nullable(),
});

const moduleSchema = z.object({
  code: z.string().min(1),
  article_number: z.string().nullable(),
  name: z.string().min(1),
  module_type: z.string().nullable(),
  construction_principle: z.string().nullable(),
  dimensions: dimensionsSchema,
  weight_kg: z.number().nullable(),
  is_assembled_at_factory: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
});

const subModuleSchema = z.object({
  code: z.string().min(1),
  module_code: z.string().min(1),
  name: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
});

// ===== operations + programs (op-level, ContractStation paralel _route.ts) =====

const stationSchema = z.enum([
  "cutting",
  "banding",
  "cnc",
  "assembly",
  "packaging",
]);

const operationSchema = z.object({
  sequence: z.number().int().positive(),
  phase: z.number().int().positive(),
  station: stationSchema,
  preferred_machine_code: z.string().nullable(),
  alternative_machine_codes: z.array(z.string()),
  required_capabilities: z.array(z.string()),
  required: z.boolean(),
  details: z.record(z.string(), z.unknown()),
});

const programSchema = z.object({
  nc_number: z.string().nullable(),
  barcode: z.string().nullable(),
  cnc_name: z.string().nullable(),
  file_path: z.string().nullable(),
  workflow: z.string().nullable(),
  sub_part_id: z.string().nullable(),
  mirror_top_bottom: z.boolean(),
  source: z.object({
    id: z.string().nullable(),
    transfer_date: z.string().nullable(),
  }),
});

// ===== machining_features (CNC geometri detay, MVP saklar kullanmaz) =====

const featureCoordSchema = z.object({
  x: z.number().nullable(),
  y: z.number().nullable(),
  z: z.number().nullable(),
});

const featureDimensionsSchema = z.object({
  width_mm: z.number().nullable(),
  depth_mm: z.number().nullable(),
  diameter_mm: z.number().nullable(),
});

const machiningFeatureSchema = z.object({
  feature_type: z.string().nullable(),
  machining: z.string().nullable(),
  position: featureCoordSchema,
  end_position: featureCoordSchema,
  dimensions: featureDimensionsSchema,
  machine_code: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});

// ===== parts (manufactured + hardware tek liste, part_type ayrımı) =====

const partDimensionTripletSchema = z.object({
  length_mm: z.number().nullable(),
  width_mm: z.number().nullable(),
  thickness_mm: z.number().nullable(),
});

const partBarcodesSchema = z.object({
  primary: z.string().nullable(),
  operation_barcodes: z.array(z.string()),
});

const partSupplierSchema = z.object({
  name: z.string().nullable(),
  part_code: z.string().nullable(),
  purchase_order_ref: z.string().nullable(),
  price_per_unit: z.number().nullable(),
});

const partEdgeSchema = z.object({
  sequence: z.number().int().positive(),
  edge_band_code: z.string().min(1),
  side: z.enum(["long_edge", "short_edge"]).nullable(),
  machining_sides: z.number().nullable(),
});

const partSchema = z.object({
  code: z.string().min(1),
  module_code: z.string().min(1),
  sub_module_code: z.string().min(1),
  article_number: z.string().nullable(),
  description: z.string().min(1),
  part_type: z.enum(["manufactured", "purchased_stock"]),
  barcodes: partBarcodesSchema,
  dimensions: z
    .object({ cutting: partDimensionTripletSchema, final: partDimensionTripletSchema })
    .nullable(),
  material_code: z.string().nullable(),
  grain_orientation_degrees: z.number().nullable(),
  quantity: z.number().int().positive(),
  edges: z.array(partEdgeSchema),
  operations: z.array(operationSchema),
  programs_unmatched: z.array(programSchema),
  machining_features: z.array(machiningFeatureSchema),
  flags: z.object({
    cut: z.boolean(),
    cnc: z.boolean(),
    include_in_bom: z.boolean(),
  }),
  supplier: partSupplierSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()),
});

// ===== top-level Part Contract =====

export const partContractSchema = z.object({
  contract_version: z.literal("2.0"),
  source: z.literal("imos"),
  source_ref: z.string().nullable(),
  imported_at: isoDateTime,
  work_order: workOrderSchema,
  project: projectSchema,
  materials: z.array(materialSchema),
  edge_bands: z.array(edgeBandSchema),
  modules: z.array(moduleSchema),
  sub_modules: z.array(subModuleSchema),
  parts: z.array(partSchema),
});

export type PartContract = z.infer<typeof partContractSchema>;
