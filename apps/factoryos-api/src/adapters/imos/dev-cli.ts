import { readFile } from "node:fs/promises";
import { parseOrder } from "./parsers/order.js";
import { parseMaterials } from "./parsers/materials.js";
import { parseEdges } from "./parsers/edges.js";
import { parseModules } from "./parsers/modules.js";
import { parseSubModules } from "./parsers/sub_modules.js";
import { parseParts } from "./parsers/parts.js";
import type { ImosRoot } from "./types.js";

/**
 * IMOS adapter dev CLI — fixture'ı parse eder, sonucu stdout'a JSON döker.
 *
 *   npm run imos:parse [-- <fixture-path>]
 *
 * Sprint 2.1 ilerledikçe yeni parser'lar buraya eklenir; her parser'ın
 * çıktısını ayrı bölüm olarak basar. Production endpoint'i değil — adapter
 * geliştirme/debug için araç.
 */

const fixturePath = process.argv[2] ?? "fixtures/imos-sample-001.json";

const raw = await readFile(fixturePath, "utf8");
const data = JSON.parse(raw) as ImosRoot;

const orderResult = parseOrder(data);
const materials = parseMaterials(data);
const edges = parseEdges(data);
const modules = parseModules(data, orderResult.project.code);
const subModules = parseSubModules(data, modules);
const parts = parseParts(data, subModules);
const mfgCount = parts.filter((p) => p.part_type === "manufactured").length;
const hwCount = parts.filter((p) => p.part_type === "purchased_stock").length;

const out = {
  source: { fixture: fixturePath, version: data.Version },
  ...orderResult,
  materials_count: materials.length,
  materials_sample: materials.slice(0, 3),
  edges_count: edges.length,
  edges_sample: edges.slice(0, 3),
  modules_count: modules.length,
  modules_sample: modules.slice(0, 3),
  sub_modules_count: subModules.length,
  sub_modules_sample: subModules.slice(0, 5),
  parts_count: parts.length,
  parts_mfg_count: mfgCount,
  parts_hardware_count: hwCount,
  parts_mfg_sample: parts.filter((p) => p.part_type === "manufactured").slice(0, 2),
  parts_hardware_sample: parts.filter((p) => p.part_type === "purchased_stock").slice(0, 2),
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
