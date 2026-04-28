import type { ImosRoot } from "../types.js";
import { collectByKey, nullIfBlank } from "../utils.js";

/**
 * IMOS Type 7 (edge) → Part Contract v2 edge_bands[].
 *
 * Material parser ile aynı dedupe stratejisi: ArticleNumber unique key,
 * ilk encounter kazanır. Edge'ler hem global liste (edge_bands[]) hem de
 * her parçanın `edges[]` alanında referansla görünür — burada sadece
 * global liste üretilir.
 */

interface RawImosEdge {
  ArticleNumber?: string;
  ArticleDescription?: string;
  EdgeMaterial?: string;
  EdgeColor?: string;
  Thickness?: string;
  EdgeGeometry?: string;
  Supplier?: string;
  PurchaseOrderNumber?: string;
}

export interface ContractEdgeBandSupplier {
  name: string | null;
  purchase_order_number: string | null;
}

export interface ContractEdgeBand {
  code: string;
  description: string;
  material: string | null;
  color: string | null;
  thickness_mm: number | null;
  geometry: string | null;
  supplier: ContractEdgeBandSupplier | null;
}

function parseNumber(input: string | undefined): number | null {
  if (!input) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function buildSupplier(e: RawImosEdge): ContractEdgeBandSupplier | null {
  const name = nullIfBlank(e.Supplier);
  const po = nullIfBlank(e.PurchaseOrderNumber);
  if (!name && !po) return null;
  return { name, purchase_order_number: po };
}

function transform(e: RawImosEdge): ContractEdgeBand | null {
  const code = nullIfBlank(e.ArticleNumber);
  if (!code) return null;
  return {
    code,
    description: nullIfBlank(e.ArticleDescription) ?? code,
    material: nullIfBlank(e.EdgeMaterial),
    color: nullIfBlank(e.EdgeColor),
    thickness_mm: parseNumber(e.Thickness),
    geometry: nullIfBlank(e.EdgeGeometry),
    supplier: buildSupplier(e),
  };
}

export function parseEdges(root: ImosRoot): ContractEdgeBand[] {
  const raw = collectByKey<RawImosEdge>(root, "edge");
  const seen = new Map<string, ContractEdgeBand>();
  for (const e of raw) {
    const transformed = transform(e);
    if (!transformed) continue;
    if (!seen.has(transformed.code)) seen.set(transformed.code, transformed);
  }
  return Array.from(seen.values());
}
