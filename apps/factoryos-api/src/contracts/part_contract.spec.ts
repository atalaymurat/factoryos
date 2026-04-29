import { partContractSchema, type PartContract } from "./part_contract.js";

/**
 * Part Contract Zod schema — negatif testler.
 *
 *   npm run contracts:check
 *
 * Test runner (Vitest) Sprint 4'te eklenecek. Şimdilik bağımlılık eklemeden,
 * Node native exit-code semantik'i ile çalışan minimal spec.
 *
 * Yapı:
 *   - Önce minimal valid base oluştur ve parse() ile sanity-check yap.
 *   - Sonra her case'de base'i klonlayıp tek bir alanı boz; parse() throw
 *     BEKLENİYOR. Eğer geçerse → schema o tipi yutuyor demektir, FAIL.
 *
 * exit 0 = tüm cases geçti; exit 1 = en az bir uyumsuzluk.
 */

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function baseContract(): PartContract {
  return {
    contract_version: "2.0",
    source: "imos",
    source_ref: null,
    imported_at: "2026-01-01T00:00:00.000Z",
    work_order: {
      code: "WO-TEST-001",
      customer_name: "Test Customer",
      customer_address: null,
      priority: "normal",
      planned_start_date: null,
      planned_end_date: null,
      notes: null,
    },
    project: {
      code: "PRJ-001",
      name: "Test Project",
      type: "kitchen",
      metadata: {},
    },
    materials: [],
    edge_bands: [],
    modules: [],
    sub_modules: [],
    parts: [
      {
        code: "PRJ-001-M01-S01-P01",
        module_code: "PRJ-001-M01",
        sub_module_code: "PRJ-001-M01-S01",
        article_number: null,
        description: "Test Part",
        part_type: "manufactured",
        barcodes: { primary: null, operation_barcodes: [] },
        dimensions: {
          cutting: { length_mm: 910, width_mm: 600, thickness_mm: 19 },
          final: { length_mm: 910, width_mm: 600, thickness_mm: 19 },
        },
        material_code: null,
        grain_orientation_degrees: null,
        quantity: 1,
        edges: [
          { sequence: 1, edge_band_code: "EDGE-1", side: null, machining_sides: null },
        ],
        operations: [],
        programs_unmatched: [],
        machining_features: [],
        flags: { cut: true, cnc: false, include_in_bom: true },
        supplier: null,
        metadata: {},
      },
    ],
  };
}

interface CaseResult {
  label: string;
  ok: boolean;
  detail?: string;
}

function expectInvalid(
  label: string,
  mutate: (c: PartContract) => void,
): CaseResult {
  const candidate = clone(baseContract());
  mutate(candidate as PartContract);
  const result = partContractSchema.safeParse(candidate);
  if (result.success) {
    return { label, ok: false, detail: "schema accepted invalid payload" };
  }
  return { label, ok: true };
}

const results: CaseResult[] = [];

// Sanity: base valid mi?
{
  const r = partContractSchema.safeParse(baseContract());
  results.push({
    label: "base contract is valid",
    ok: r.success,
    detail: r.success ? undefined : JSON.stringify(r.error.issues[0]),
  });
}

// Negative cases — her biri bir tek alanı bozar.
results.push(
  expectInvalid("contract_version literal mismatch", (c) => {
    (c as { contract_version: string }).contract_version = "1.0";
  }),
  expectInvalid("work_order.priority case-sensitive enum", (c) => {
    (c.work_order as { priority: string }).priority = "URGENT";
  }),
  expectInvalid("work_order.code empty string", (c) => {
    c.work_order.code = "";
  }),
  expectInvalid("parts[0].quantity = 0 (must be positive)", (c) => {
    c.parts[0]!.quantity = 0;
  }),
  expectInvalid("parts[0].part_type invalid enum", (c) => {
    (c.parts[0] as { part_type: string }).part_type = "unknown";
  }),
  expectInvalid("parts[0].code empty string", (c) => {
    c.parts[0]!.code = "";
  }),
  expectInvalid("parts[0].edges[0].edge_band_code empty", (c) => {
    c.parts[0]!.edges[0]!.edge_band_code = "";
  }),
  expectInvalid("parts[0].dimensions.cutting.length_mm wrong type", (c) => {
    (c.parts[0]!.dimensions!.cutting as { length_mm: unknown }).length_mm = "910";
  }),
  expectInvalid("imported_at not ISO datetime", (c) => {
    c.imported_at = "yesterday";
  }),
);

const failed = results.filter((r) => !r.ok);
const tag = failed.length === 0 ? "PASS" : "FAIL";
process.stdout.write(`contracts:check ${tag} (${results.length} cases)\n`);
for (const r of results) {
  const mark = r.ok ? "  ✓" : "  ✗";
  process.stdout.write(`${mark} ${r.label}`);
  if (r.detail) process.stdout.write(`  — ${r.detail}`);
  process.stdout.write("\n");
}

if (failed.length > 0) {
  process.stdout.write(`\n${failed.length} assertion(s) failed.\n`);
  process.exit(1);
}
