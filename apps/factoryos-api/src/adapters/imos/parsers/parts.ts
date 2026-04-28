import type { ImosRoot, ImosPart } from "../types.js";
import { collectByKey, findPartSubelements, nullIfBlank } from "../utils.js";
import { logger } from "../../../lib/logger.js";
import type { ContractSubModule } from "./sub_modules.js";
import { buildPartOperations, type ContractOperation } from "./_route.js";
import { attachProgramsToOperations, type ContractProgram } from "./_programs.js";

export type { ContractOperation } from "./_route.js";
export type { ContractProgram } from "./_programs.js";

/**
 * IMOS Type 3 (manufactured) + Type 8 (hardware) → Part Contract v2 parts[].
 *
 * 6a — skeleton: temel alanlar + parent matching + material referansı.
 * Edges, operations, programs, machining_features sonraki adımlarda gelir.
 *
 * Code generation: `{sub_module.code}-P{NN}` — hierarchical, project-içi
 * unique garantili. Barcode ayrı alanda taşınır (operatör tarama için).
 *
 * Orphan policy (Karar A): parent sub_module bulunamayan part skip + warning.
 */

export interface PartDimensionTriplet {
  length_mm: number | null;
  width_mm: number | null;
  thickness_mm: number | null;
}

export interface ContractPartBarcodes {
  primary: string | null;
  operation_barcodes: string[];
}

export interface ContractPartSupplier {
  name: string | null;
  part_code: string | null;
  purchase_order_ref: string | null;
  price_per_unit: number | null;
}

export interface ContractPartEdge {
  sequence: number;
  edge_band_code: string;
  side: "long_edge" | "short_edge" | null;
  machining_sides: number | null;
}

export interface ContractPart {
  code: string;
  module_code: string;
  sub_module_code: string;
  article_number: string | null;
  description: string;
  part_type: "manufactured" | "purchased_stock";
  barcodes: ContractPartBarcodes;
  dimensions: { cutting: PartDimensionTriplet; final: PartDimensionTriplet } | null;
  material_code: string | null;
  grain_orientation_degrees: number | null;
  quantity: number;
  // Mfg part'ta dolu; hardware'da boş array.
  edges: ContractPartEdge[];
  // Mfg: ProductionRoute'tan parse edilir + assembly/packaging auto-append.
  // Hardware: sadece tek assembly operation.
  operations: ContractOperation[];
  // Rotada listelenmemiş ama IMOS'un CNC dosyası ürettiği makinelere ait
  // programlar. Alternatif makine adayları olabilir (saha kararı).
  programs_unmatched: ContractProgram[];
  flags: { cut: boolean; cnc: boolean; include_in_bom: boolean };
  // Sadece purchased_stock'ta dolu; mfg part'ta null.
  supplier: ContractPartSupplier | null;
  metadata: Record<string, unknown>;
}

function parseNumber(input: string | undefined): number | null {
  if (!input) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

// IMOS flag'leri "1"/"0" string olarak gelir; boş alan default false.
function parseFlag(input: string | undefined): boolean {
  return (input ?? "").trim() === "1";
}

// Manufactured part'ın altındaki material subelement → ArticleNumber.
// Hardware'da material yok, null döner.
function findMaterialCode(part: ImosPart): string | null {
  const mats = findPartSubelements<{ ArticleNumber?: string }>(part, "material");
  return nullIfBlank(mats[0]?.ArticleNumber);
}

// Per-part edge subelement raw shape (Type 7).
interface RawImosPartEdge {
  ArticleNumber?: string;
  EdgeSequence?: string;
  EdgeTrim?: string;          // "L" → long_edge, "S" → short_edge
  MachiningSides?: string;
}

function parseEdgeSide(input: string | undefined): "long_edge" | "short_edge" | null {
  const v = (input ?? "").trim().toUpperCase();
  if (v === "L") return "long_edge";
  if (v === "S") return "short_edge";
  return null;
}

// Manufactured part'ın altındaki edge subelement'lardan part-level edge listesi.
// Hardware'da edge yok, boş array döner. EdgeSequence'a göre sıralar.
function buildEdges(part: ImosPart): ContractPartEdge[] {
  const raw = findPartSubelements<RawImosPartEdge>(part, "edge");
  const out: ContractPartEdge[] = [];
  for (const e of raw) {
    const code = nullIfBlank(e.ArticleNumber);
    if (!code) continue;
    out.push({
      sequence: parseNumber(e.EdgeSequence) ?? out.length + 1,
      edge_band_code: code,
      side: parseEdgeSide(e.EdgeTrim),
      machining_sides: parseNumber(e.MachiningSides),
    });
  }
  return out.sort((a, b) => a.sequence - b.sequence);
}

// Hardware (Type 8) için tedarikçi blokunu çıkarır. Tüm alanlar boşsa null.
// Mfg part'ta her zaman null (transform içinde bypass edilir).
function buildSupplier(part: ImosPart): ContractPartSupplier | null {
  const name = nullIfBlank(part.Supplier);
  const partCode = nullIfBlank(part.ArticleNumber);
  const poRef = nullIfBlank(part.PurchaseOrderNumber);
  const price = parseNumber(part.Price);
  if (!name && !partCode && !poRef && price === null) return null;
  return {
    name,
    part_code: partCode,
    purchase_order_ref: poRef,
    price_per_unit: price,
  };
}

function buildBarcodes(part: ImosPart): ContractPartBarcodes {
  const ops = [part.NcBarcode1, part.NcBarcode2, part.NcBarcode3]
    .map((b) => nullIfBlank(b))
    .filter((b): b is string => b !== null);
  return { primary: nullIfBlank(part.Barcode), operation_barcodes: ops };
}

function buildDimensions(
  part: ImosPart,
): { cutting: PartDimensionTriplet; final: PartDimensionTriplet } | null {
  if (part["#Typ"] !== "3") return null; // hardware'da yok
  return {
    cutting: {
      length_mm: parseNumber(part.CuttingLength),
      width_mm: parseNumber(part.CuttingWidth),
      thickness_mm: parseNumber(part.CuttingThickness),
    },
    final: {
      length_mm: parseNumber(part.Length),
      width_mm: parseNumber(part.Width),
      thickness_mm: parseNumber(part.Thickness),
    },
  };
}

function transform(
  part: ImosPart,
  subModule: ContractSubModule,
  sequence: number,
): ContractPart {
  const code = `${subModule.code}-P${String(sequence).padStart(2, "0")}`;
  const partType: ContractPart["part_type"] =
    part["#Typ"] === "8" ? "purchased_stock" : "manufactured";
  const articleNumber = nullIfBlank(part.ArticleNumber);
  // Operations'ı önce kur, sonra programs'ı (Type 9) eşleşen op'ların
  // details.programs[]'ına ekle. Mutator: operations array'i yerinde değişir.
  // Eşleşmeyen programlar dönüş array'inde toplanır (alternatif makine olabilir).
  const operations = buildPartOperations(part);
  const programsUnmatched = attachProgramsToOperations(part, operations);
  return {
    code,
    module_code: subModule.module_code,
    sub_module_code: subModule.code,
    article_number: articleNumber,
    description: nullIfBlank(part.ArticleDescription) ?? articleNumber ?? code,
    part_type: partType,
    barcodes: buildBarcodes(part),
    dimensions: buildDimensions(part),
    material_code: partType === "manufactured" ? findMaterialCode(part) : null,
    grain_orientation_degrees: parseNumber(part.GrainOrientation),
    quantity: parseNumber(part.DesiredTargetQuantity) ?? 1,
    edges: partType === "manufactured" ? buildEdges(part) : [],
    operations,
    programs_unmatched: programsUnmatched,
    flags: {
      cut: parseFlag(part.CutFlag),
      cnc: parseFlag(part.CncFlag),
      include_in_bom: parseFlag(part.BomFlag),
    },
    supplier: partType === "purchased_stock" ? buildSupplier(part) : null,
    metadata: {
      source_id: part.ID,
      source_typ: part["#Typ"],
      ...(nullIfBlank(part.PartDefinition)
        ? { part_definition: nullIfBlank(part.PartDefinition) }
        : {}),
      ...(nullIfBlank(part.Checksum)
        ? { checksum: nullIfBlank(part.Checksum) }
        : {}),
      ...(nullIfBlank(part.EdgeTransition)
        ? { edge_transition_code: nullIfBlank(part.EdgeTransition) }
        : {}),
    },
  };
}

export function parseParts(
  root: ImosRoot,
  subModules: ContractSubModule[],
): ContractPart[] {
  const subModuleByAssemblyId = new Map<string, ContractSubModule>();
  for (const sm of subModules) {
    const sourceId = sm.metadata.source_id;
    if (typeof sourceId === "string") subModuleByAssemblyId.set(sourceId, sm);
  }

  const seqBySubModule = new Map<string, number>();
  const out: ContractPart[] = [];
  let orphanCount = 0;

  const parts = collectByKey<ImosPart>(root, "part");
  for (const p of parts) {
    const id = nullIfBlank(p.ID);
    const parentId = nullIfBlank(p["#ParentId"]);
    if (!id || !parentId) {
      logger.warn({ part_id: p.ID }, "imos: part missing ID or #ParentId — skip");
      orphanCount++;
      continue;
    }
    const parentSub = subModuleByAssemblyId.get(parentId);
    if (!parentSub) {
      logger.warn(
        { part_id: id, parent_id: parentId },
        "imos: part parent sub_module not found — skip",
      );
      orphanCount++;
      continue;
    }
    const seq = (seqBySubModule.get(parentSub.code) ?? 0) + 1;
    seqBySubModule.set(parentSub.code, seq);
    out.push(transform(p, parentSub, seq));
  }

  if (orphanCount > 0) {
    logger.warn({ orphan_count: orphanCount }, "imos: skipped orphan parts");
  }
  return out;
}
