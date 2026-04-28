import { readFile } from "node:fs/promises";
import { parseImosContract } from "./parseImosContract.js";
import type { ImosRoot } from "./types.js";

/**
 * IMOS adapter smoke test — fixture parse + beklenen sayımlar regression check.
 *
 *   npm run imos:check [-- <fixture-path>]
 *
 * Test runner (Vitest vs.) Sprint 4'te eklenecek. Şimdilik bağımlılık eklemeden
 * Node native exit-code semantik'i kullanan minimal bir check: parser'lardan
 * birinde sessiz regression olursa CI/dev workflow'da yakalanır.
 *
 * Beklenen sayımlar `imos-sample-001.json` (gerçek müşteri export'u, repo
 * dışında) için sabittir; başka fixture geçirilirse beklenenleri override
 * etmek istersen --counts <json-file> argümanı ekle (henüz yok).
 *
 * exit 0 = tüm assertion'lar geçti; exit 1 = en az bir uyumsuzluk.
 */

interface ExpectedCounts {
  materials: number;
  edge_bands: number;
  modules: number;
  sub_modules: number;
  parts: number;
  parts_mfg: number;
  parts_hardware: number;
  /** Programs'ın op'a bağlanmadan part-level programs_unmatched[]'a düşen toplamı (mfg parça için). */
  programs_unmatched: number;
  machining_features: number;
}

// imos-sample-001.json için kayıtlı beklenen sayımlar.
// Bir parser değişimi bu sayıları değiştirirse: önce manuel doğrula
// (npm run imos:parse), kasıtlı değişimse buradaki sayıları güncelle.
const EXPECTED: ExpectedCounts = {
  materials: 5,
  edge_bands: 2,
  modules: 22,
  sub_modules: 158,
  parts: 983,
  parts_mfg: 184,
  parts_hardware: 799,
  programs_unmatched: 240,
  machining_features: 120,
};

interface AssertResult {
  label: string;
  expected: number;
  actual: number;
  ok: boolean;
}

function check(label: string, expected: number, actual: number): AssertResult {
  return { label, expected, actual, ok: expected === actual };
}

const fixturePath = process.argv[2] ?? "fixtures/imos-sample-001.json";

const raw = await readFile(fixturePath, "utf8");
const data = JSON.parse(raw) as ImosRoot;
const contract = parseImosContract(data, {
  sourceRef: fixturePath,
  importedAt: "2026-01-01T00:00:00.000Z", // deterministic
});

const mfg = contract.parts.filter((p) => p.part_type === "manufactured");
const hw = contract.parts.filter((p) => p.part_type === "purchased_stock");
const programsUnmatchedTotal = mfg.reduce(
  (acc, p) => acc + p.programs_unmatched.length,
  0,
);
const machiningFeaturesTotal = mfg.reduce(
  (acc, p) => acc + p.machining_features.length,
  0,
);

const results: AssertResult[] = [
  check("materials", EXPECTED.materials, contract.materials.length),
  check("edge_bands", EXPECTED.edge_bands, contract.edge_bands.length),
  check("modules", EXPECTED.modules, contract.modules.length),
  check("sub_modules", EXPECTED.sub_modules, contract.sub_modules.length),
  check("parts", EXPECTED.parts, contract.parts.length),
  check("parts_mfg", EXPECTED.parts_mfg, mfg.length),
  check("parts_hardware", EXPECTED.parts_hardware, hw.length),
  check(
    "programs_unmatched",
    EXPECTED.programs_unmatched,
    programsUnmatchedTotal,
  ),
  check(
    "machining_features",
    EXPECTED.machining_features,
    machiningFeaturesTotal,
  ),
];

const failed = results.filter((r) => !r.ok);
const tag = failed.length === 0 ? "PASS" : "FAIL";

process.stdout.write(`imos:check ${tag} (${fixturePath})\n`);
for (const r of results) {
  const mark = r.ok ? "  ✓" : "  ✗";
  process.stdout.write(
    `${mark} ${r.label.padEnd(22)} expected=${r.expected}  actual=${r.actual}\n`,
  );
}

if (failed.length > 0) {
  process.stdout.write(`\n${failed.length} assertion(s) failed.\n`);
  process.exit(1);
}
