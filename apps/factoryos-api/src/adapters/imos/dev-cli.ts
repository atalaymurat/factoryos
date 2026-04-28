import { readFile } from "node:fs/promises";
import { parseImosContract } from "./parseImosContract.js";
import type { ImosRoot } from "./types.js";

/**
 * IMOS adapter dev CLI — fixture'ı parse eder, debug özetini stdout'a JSON döker.
 *
 *   npm run imos:parse [-- <fixture-path>]
 *
 * Production endpoint'i değil. Tam contract çıktısı yerine sayım + sample alır
 * (5MB+ fixture'da tam çıktı şişirici olur). Tam contract için
 * orchestrator'ı (`parseImosContract`) doğrudan çağırın.
 */

const fixturePath = process.argv[2] ?? "fixtures/imos-sample-001.json";

const raw = await readFile(fixturePath, "utf8");
const data = JSON.parse(raw) as ImosRoot;

const contract = parseImosContract(data, { sourceRef: fixturePath });

const mfg = contract.parts.filter((p) => p.part_type === "manufactured");
const hw = contract.parts.filter((p) => p.part_type === "purchased_stock");

const out = {
  source: {
    fixture: fixturePath,
    version: data.Version,
    contract_version: contract.contract_version,
  },
  work_order: contract.work_order,
  project: contract.project,
  materials_count: contract.materials.length,
  materials_sample: contract.materials.slice(0, 3),
  edges_count: contract.edge_bands.length,
  edges_sample: contract.edge_bands.slice(0, 3),
  modules_count: contract.modules.length,
  modules_sample: contract.modules.slice(0, 3),
  sub_modules_count: contract.sub_modules.length,
  sub_modules_sample: contract.sub_modules.slice(0, 5),
  parts_count: contract.parts.length,
  parts_mfg_count: mfg.length,
  parts_hardware_count: hw.length,
  parts_mfg_sample: mfg.slice(0, 2),
  parts_hardware_sample: hw.slice(0, 2),
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
