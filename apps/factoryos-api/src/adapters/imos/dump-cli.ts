import { readFile } from "node:fs/promises";
import { parseImosContract } from "./parseImosContract.js";
import type { ImosRoot } from "./types.js";

/**
 * IMOS adapter dump CLI — fixture'ı parse edip TAM Part Contract'ı stdout'a yazar.
 *
 *   npm run imos:dump [-- <fixture-path>] > contract.json
 *
 * dev-cli sample/count özet basar (debug için); bu CLI tam JSON'u dump eder
 * ki curl ile import endpoint'i test edilebilsin (Sprint 2.4 entegrasyon).
 *
 * imported_at deterministic değil — production'da `new Date()` kullanılır.
 * Test akışında sabit timestamp gerekiyorsa orchestrator'a importedAt geçilir;
 * bu CLI default'u kullanıyor.
 */

const fixturePath = process.argv[2] ?? "fixtures/imos-sample-001.json";

const raw = await readFile(fixturePath, "utf8");
const data = JSON.parse(raw) as ImosRoot;
const contract = parseImosContract(data, { sourceRef: fixturePath });

process.stdout.write(JSON.stringify(contract));
