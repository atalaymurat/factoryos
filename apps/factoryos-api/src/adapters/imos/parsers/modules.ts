import type { ImosRoot, ImosArticle } from "../types.js";
import { nullIfBlank } from "../utils.js";

/**
 * IMOS Type 1 (article) → Part Contract v2 modules[].
 *
 * Module `code` üretimi: `{project.code}-M{NN}` — sequence, toplam article
 * sayısına göre 0-padlenir (22 article için M01..M22, 100+ için M001+).
 *
 * `article.ID` → `metadata.source_id`: assembly parser bunu okuyup
 * `assembly.#ParentId` ile eşleştirerek sub_module → module FK kurar.
 *
 * NOT: `article.ArticleNumber` unique DEĞİL (W_2D fixture'da iki kez geçer)
 * — sadece construction principle göstergesi olarak saklanır.
 */

export interface ContractDimensions {
  length_mm: number | null;
  width_mm: number | null;
  depth_mm: number | null;
}

export interface ContractModule {
  code: string;
  article_number: string | null;
  name: string;
  module_type: string | null;
  construction_principle: string | null;
  dimensions: ContractDimensions;
  weight_kg: number | null;
  is_assembled_at_factory: boolean;
  metadata: Record<string, unknown>;
}

function parseNumber(input: string | undefined): number | null {
  if (!input) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function buildCode(projectCode: string, index: number, total: number): string {
  const width = Math.max(2, String(total).length);
  const seq = String(index + 1).padStart(width, "0");
  return `${projectCode}-M${seq}`;
}

function transform(
  article: ImosArticle,
  index: number,
  total: number,
  projectCode: string,
): ContractModule {
  const articleNumber = nullIfBlank(article.ArticleNumber);
  return {
    code: buildCode(projectCode, index, total),
    article_number: articleNumber,
    // Name fallback: ArticleDescription → ArticleNumber → "module-{seq}"
    // İlk article fixture'da "Article Designer Group" gibi placeholder döner;
    // gerçek müşteri data'sında modül başına anlamlı description gelir.
    name:
      nullIfBlank(article.ArticleDescription) ??
      articleNumber ??
      `module-${index + 1}`,
    // module_type IMOS'tan doğrudan gelmiyor; supervisor UI'da elle setlenir
    // ya da mapping kuralı eklenir (ör. ArticleNumber prefix W_ → wall_cabinet).
    // Şimdilik null; ileride kural tablosuna bağlanır.
    module_type: null,
    construction_principle:
      nullIfBlank(article.ConstructionPrinciple) ?? articleNumber,
    dimensions: {
      length_mm: parseNumber(article.Length),
      width_mm: parseNumber(article.Width),
      depth_mm: parseNumber(article.Thickness),
    },
    weight_kg: parseNumber(article.Weight),
    is_assembled_at_factory:
      (article.ArticleInfo1 ?? "").trim() === "Assembled",
    metadata: {
      source_id: article.ID,
    },
  };
}

export function parseModules(
  root: ImosRoot,
  projectCode: string,
): ContractModule[] {
  const subs = root.order.subelements ?? [];
  return subs.map((s, i) => transform(s.article, i, subs.length, projectCode));
}
