import type { ImosRoot } from "./types.js";
import { parseOrder } from "./parsers/order.js";
import { parseMaterials } from "./parsers/materials.js";
import { parseEdges } from "./parsers/edges.js";
import { parseModules } from "./parsers/modules.js";
import { parseSubModules } from "./parsers/sub_modules.js";
import { parseParts } from "./parsers/parts.js";
import type { ContractWorkOrder, ContractProject } from "./parsers/order.js";
import type { ContractMaterial } from "./parsers/materials.js";
import type { ContractEdgeBand } from "./parsers/edges.js";
import type { ContractModule } from "./parsers/modules.js";
import type { ContractSubModule } from "./parsers/sub_modules.js";
import type { ContractPart } from "./parsers/parts.js";

/**
 * IMOS adapter top-level orchestrator.
 *
 * IMOS root → Part Contract v2 (single JSON object). Tüm parser'lar
 * sırayla çağrılır; çıktı domain-model-v2.md ve part_contract_v2.md
 * spec'inde tanımlı yapıya birebir uyar.
 *
 * Sprint 2.2'de Zod schema bu tip üzerinden derived edilecek; şimdilik
 * orchestrator + interface manuel — single source of truth: bu dosya.
 *
 * MES catalog (machines, stations) bu contract'a girmez — adapter
 * sadece referans verir, import endpoint FK doğrulaması yapar
 * (docs/adapters-reference.md § "MES Catalog Authority").
 */

export interface PartContract {
  contract_version: "2.0";
  source: "imos";
  source_ref: string | null;
  imported_at: string;

  work_order: ContractWorkOrder;
  project: ContractProject;

  materials: ContractMaterial[];
  edge_bands: ContractEdgeBand[];

  modules: ContractModule[];
  sub_modules: ContractSubModule[];
  parts: ContractPart[];
}

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

  return {
    contract_version: "2.0",
    source: "imos",
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
}
