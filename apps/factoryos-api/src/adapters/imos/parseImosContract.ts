import type { ImosRoot } from "./types.js";
import { parseOrder } from "./parsers/order.js";
import { parseMaterials } from "./parsers/materials.js";
import { parseEdges } from "./parsers/edges.js";
import { parseModules } from "./parsers/modules.js";
import { parseSubModules } from "./parsers/sub_modules.js";
import { parseParts } from "./parsers/parts.js";
import {
  partContractSchema,
  type PartContract,
} from "../../contracts/part_contract.js";

/**
 * IMOS adapter top-level orchestrator.
 *
 * IMOS root → Part Contract v2 (single JSON object). Tüm parser'lar sırayla
 * çağrılır, sonuç `partContractSchema` ile doğrulanır. Şema canonical source
 * of truth (src/contracts/part_contract.ts).
 *
 * Defense in depth (Karar B): adapter çıkışında parse() ile validate. Adapter
 * bug'ı varsa runtime'da burada yakalanır; HTTP boundary aynı schema'yı
 * tekrar uygular.
 *
 * MES catalog (machines, stations) bu contract'a girmez — adapter sadece
 * referans verir, import endpoint FK doğrulaması yapar
 * (docs/adapters-reference.md § "MES Catalog Authority").
 */

export type { PartContract } from "../../contracts/part_contract.js";

export interface ParseImosOptions {
  /** Adapter çıktısında source_ref olarak yazılır (örn fixture path). */
  sourceRef?: string;
  /** Test'te deterministic output için override; default `new Date().toISOString()`. */
  importedAt?: string;
}

export function parseImosContract(
  root: ImosRoot,
  options: ParseImosOptions = {},
): PartContract {
  const { work_order, project } = parseOrder(root);
  const materials = parseMaterials(root);
  const edge_bands = parseEdges(root);
  const modules = parseModules(root, project.code);
  const sub_modules = parseSubModules(root, modules);
  const parts = parseParts(root, sub_modules);

  const candidate = {
    contract_version: "2.0" as const,
    source: "imos" as const,
    source_ref: options.sourceRef ?? null,
    imported_at: options.importedAt ?? new Date().toISOString(),
    work_order,
    project,
    materials,
    edge_bands,
    modules,
    sub_modules,
    parts,
  };

  // parse() throws ZodError on mismatch — adapter bug'ında stack trace + path.
  return partContractSchema.parse(candidate);
}
