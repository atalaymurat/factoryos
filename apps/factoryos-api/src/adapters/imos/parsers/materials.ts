import type { ImosRoot } from "../types.js";
import { collectByKey, nullIfBlank } from "../utils.js";

/**
 * IMOS Type 4 (material) → Part Contract v2 materials[].
 *
 * IMOS aynı malzemeyi her parçanın altında tekrar yazar (169 occurrence,
 * fakat ~5 unique). Burada `ArticleNumber` üzerinden dedupe ederiz —
 * ilk encounter kazanır, sonrakiler atlanır. Eğer alanlar farklı dolu gelseydi
 * birleştirme stratejisi gerekirdi; pratikte IMOS aynı kodu aynı meta ile yazar.
 */

interface RawImosMaterial {
  ArticleNumber?: string;
  ArticleDescription?: string;
  ArticleDescription2?: string;
  MaterialCategory?: string;
  Thickness?: string;
  MaterialGrain?: string;
  Supplier?: string;
  PurchaseOrderNumber?: string;
  Price?: string;
}

export interface ContractMaterialSupplier {
  name: string | null;
  purchase_order_number: string | null;
  price_per_sheet: number | null;
}

export interface ContractMaterial {
  code: string;
  description: string;
  description_long: string | null;
  category: string | null;
  thickness_mm: number | null;
  grain: boolean;
  supplier: ContractMaterialSupplier | null;
}

function parseNumber(input: string | undefined): number | null {
  if (!input) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

// IMOS MaterialGrain: "1"/"true" → grain var, boş/"0" → yok.
function parseGrain(input: string | undefined): boolean {
  if (!input) return false;
  const v = input.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function buildSupplier(m: RawImosMaterial): ContractMaterialSupplier | null {
  const name = nullIfBlank(m.Supplier);
  const po = nullIfBlank(m.PurchaseOrderNumber);
  const price = parseNumber(m.Price);
  if (!name && !po && price === null) return null;
  return { name, purchase_order_number: po, price_per_sheet: price };
}

function transform(m: RawImosMaterial): ContractMaterial | null {
  const code = nullIfBlank(m.ArticleNumber);
  if (!code) return null;
  return {
    code,
    description: nullIfBlank(m.ArticleDescription) ?? code,
    description_long: nullIfBlank(m.ArticleDescription2),
    category: nullIfBlank(m.MaterialCategory),
    thickness_mm: parseNumber(m.Thickness),
    grain: parseGrain(m.MaterialGrain),
    supplier: buildSupplier(m),
  };
}

export function parseMaterials(root: ImosRoot): ContractMaterial[] {
  const raw = collectByKey<RawImosMaterial>(root, "material");
  const seen = new Map<string, ContractMaterial>();
  for (const m of raw) {
    const transformed = transform(m);
    if (!transformed) continue;
    if (!seen.has(transformed.code)) seen.set(transformed.code, transformed);
  }
  return Array.from(seen.values());
}
