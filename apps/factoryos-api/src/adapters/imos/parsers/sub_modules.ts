import type { ImosRoot, ImosAssembly } from "../types.js";
import { collectByKey, nullIfBlank } from "../utils.js";
import { logger } from "../../../lib/logger.js";
import type { ContractModule } from "./modules.js";

/**
 * IMOS Type 2 (assembly) → Part Contract v2 sub_modules[].
 *
 * Parent matching: `assembly.#ParentId === article.ID`. Article ID'leri
 * `modules[].metadata.source_id` üzerinden modules'a bağlanır.
 *
 * Orphan policy (Atalay'ın A kararı): parent module bulunamayan assembly
 * warning log'lanır ve atlanır — adapter durmaz, supervisor UI'da
 * "X sub_module orphan" görünür ve elle düzeltilir. Üretim akışı bozuk
 * export'a karşı dirençli.
 *
 * Sub-module code: `{module.code}-S{NN}` — sequence module-içi sayım.
 */

export interface ContractSubModule {
  code: string;
  module_code: string;
  name: string;
  sequence: number;
  metadata: Record<string, unknown>;
}

function buildSubModuleCode(moduleCode: string, sequence: number): string {
  return `${moduleCode}-S${String(sequence).padStart(2, "0")}`;
}

export function parseSubModules(
  root: ImosRoot,
  modules: ContractModule[],
): ContractSubModule[] {
  // article.ID → module (metadata.source_id üzerinden)
  const moduleByArticleId = new Map<string, ContractModule>();
  for (const m of modules) {
    const sourceId = m.metadata.source_id;
    if (typeof sourceId === "string") {
      moduleByArticleId.set(sourceId, m);
    }
  }

  const seqByModule = new Map<string, number>();
  const out: ContractSubModule[] = [];
  let orphanCount = 0;

  const assemblies = collectByKey<ImosAssembly>(root, "assembly");
  for (const a of assemblies) {
    const id = nullIfBlank(a.ID);
    const parentId = nullIfBlank(a["#ParentId"]);
    if (!id || !parentId) {
      logger.warn({ assembly_id: a.ID }, "imos: assembly missing ID or #ParentId — skip");
      orphanCount++;
      continue;
    }
    const parentModule = moduleByArticleId.get(parentId);
    if (!parentModule) {
      logger.warn(
        { assembly_id: id, parent_id: parentId },
        "imos: assembly parent module not found — skip",
      );
      orphanCount++;
      continue;
    }
    const seq = (seqByModule.get(parentModule.code) ?? 0) + 1;
    seqByModule.set(parentModule.code, seq);
    out.push({
      code: buildSubModuleCode(parentModule.code, seq),
      module_code: parentModule.code,
      name: nullIfBlank(a.ArticleNumber) ?? `sub-module-${seq}`,
      sequence: seq,
      metadata: { source_id: id },
    });
  }

  if (orphanCount > 0) {
    logger.warn({ orphan_count: orphanCount }, "imos: skipped orphan assemblies");
  }
  return out;
}
