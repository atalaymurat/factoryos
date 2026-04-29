import { readFile } from "node:fs/promises";
import { db, pool } from "../../db/client.js";
import type { ImosRoot } from "./types.js";
import { collectByKey } from "./utils.js";
import type {
  MachineType,
  StationType,
} from "../../db/types.generated.js";

/**
 * One-shot bootstrap: IMOS sample → mes.stations + mes.machines.
 *
 *   npm run bootstrap:catalog -- <imos-sample.json>
 *
 * Production import path'i DEĞİL. Install-time'da bir kez çalışır:
 * fabrikanın IMOS'unda configured machine code'larını MES catalog'una
 * seed eder ki sonraki Part Contract import'larındaki FK validation
 * (Sprint 2.3) geçsin. Atalay/supervisor sonra UI'dan name'leri
 * Türkçeleştirip kategorileri düzeltir.
 *
 * Idempotent: ON CONFLICT (code) DO NOTHING. Re-run = zero new rows.
 *
 * Spec: docs/adapters-reference.md § "Initial Bootstrap".
 */

interface PrefixRule {
  prefix: string;
  machine_type: MachineType;
  station_type: StationType;
}

// IMOS makine model prefix → (machine_type, station_type).
// Sıra önemli: ETQS ile ETQ aynı edge_bander, ama uzun prefix önce gelmeli
// (eşleşme StartsWith). Şu an çakışma yok — yine de defansif sırala.
const PREFIX_RULES: PrefixRule[] = [
  { prefix: "BHN", machine_type: "panel_saw", station_type: "cutting" },
  { prefix: "ETQ", machine_type: "edge_bander", station_type: "banding" },
  { prefix: "DTQ", machine_type: "edge_bander", station_type: "banding" },
  { prefix: "BHX", machine_type: "cnc_router", station_type: "cnc" },
  { prefix: "BHH", machine_type: "cnc_router", station_type: "cnc" },
  { prefix: "MLK", machine_type: "cnc_drill", station_type: "cnc" },
  { prefix: "JP_DH", machine_type: "cnc_drill", station_type: "cnc" },
];

// Sabit station seed listesi — sample'da olsun olmasın 5 station_type'ın
// hepsi yaratılır. Tail ops (assembly, packaging) sample'da makine taşımaz
// ama production akışında station referansı gerekli.
const STATION_SEEDS: Array<{
  code: string;
  name: string;
  station_type: StationType;
  display_order: number;
}> = [
  { code: "STA-CUTTING", name: "Cutting Station", station_type: "cutting", display_order: 1 },
  { code: "STA-BANDING", name: "Banding Station", station_type: "banding", display_order: 2 },
  { code: "STA-CNC", name: "CNC Station", station_type: "cnc", display_order: 3 },
  { code: "STA-ASSEMBLY", name: "Assembly Station", station_type: "assembly", display_order: 4 },
  { code: "STA-PACKAGING", name: "Packaging Station", station_type: "packaging", display_order: 5 },
];

interface MachineCandidate {
  code: string;
  model: string;
  machine_type: MachineType;
  station_type: StationType;
}

function classify(model: string): { machine_type: MachineType; station_type: StationType } {
  const upper = model.toUpperCase();
  for (const r of PREFIX_RULES) {
    if (upper.startsWith(r.prefix)) {
      return { machine_type: r.machine_type, station_type: r.station_type };
    }
  }
  // Bilinmeyen prefix → generic / cnc (CNC en yaygın belirsiz makine türü).
  return { machine_type: "generic", station_type: "cnc" };
}

function extractMachines(root: ImosRoot): MachineCandidate[] {
  const seen = new Map<string, MachineCandidate>();

  // Type 3 parts → ProductionRoute token'ları
  const parts = collectByKey<{ "#Typ"?: string; ProductionRoute?: string }>(root, "part");
  for (const p of parts) {
    if (p["#Typ"] !== "3" || !p.ProductionRoute) continue;
    for (const token of p.ProductionRoute.split("&")) {
      const ps = token.split("_");
      if (ps.length < 3) continue;
      const id = ps[1];
      const model = ps.slice(2).join("_");
      if (!id || !model) continue;
      const code = `${id}_${model}`;
      if (seen.has(code)) continue;
      seen.set(code, { code, model, ...classify(model) });
    }
  }

  // Type 9 programs → MachineID
  const programs = collectByKey<{ MachineID?: string }>(root, "program");
  for (const pr of programs) {
    const code = pr.MachineID?.trim();
    if (!code || seen.has(code)) continue;
    const ps = code.split("_");
    if (ps.length < 2) continue;
    const model = ps.slice(1).join("_");
    seen.set(code, { code, model, ...classify(model) });
  }

  return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code));
}

interface SeedReport {
  stations: { added: number; skipped: number; total: number };
  machines: { added: number; skipped: number; total: number };
  unknown_models: string[];
}

async function seed(machines: MachineCandidate[]): Promise<SeedReport> {
  const report: SeedReport = {
    stations: { added: 0, skipped: 0, total: STATION_SEEDS.length },
    machines: { added: 0, skipped: 0, total: machines.length },
    unknown_models: machines
      .filter((m) => m.machine_type === "generic")
      .map((m) => m.model),
  };

  await db.transaction().execute(async (trx) => {
    // Stations: sabit 5 seed, idempotent.
    for (const s of STATION_SEEDS) {
      const result = await trx
        .insertInto("stations")
        .values(s)
        .onConflict((oc) => oc.column("code").doNothing())
        .executeTakeFirst();
      if ((result.numInsertedOrUpdatedRows ?? 0n) > 0n) report.stations.added++;
      else report.stations.skipped++;
    }

    // station_type → station_id map (yeni eklendi VEYA zaten vardı)
    const stationRows = await trx
      .selectFrom("stations")
      .select(["id", "station_type"])
      .execute();
    const stationIdByType = new Map<StationType, string>();
    for (const row of stationRows) stationIdByType.set(row.station_type, row.id);

    // Machines: sample'dan, idempotent.
    for (const m of machines) {
      const station_id = stationIdByType.get(m.station_type);
      if (!station_id) continue; // STATION_SEEDS hepsini yarattığı için bu olmamalı
      const result = await trx
        .insertInto("machines")
        .values({
          code: m.code,
          name: `${m.model} #${m.code.split("_")[0]}`, // okunaklı: "BHX560 #10303"
          model: m.model,
          machine_type: m.machine_type,
          station_id,
        })
        .onConflict((oc) => oc.column("code").doNothing())
        .executeTakeFirst();
      if ((result.numInsertedOrUpdatedRows ?? 0n) > 0n) report.machines.added++;
      else report.machines.skipped++;
    }
  });

  return report;
}

const fixturePath = process.argv[2];
if (!fixturePath) {
  process.stderr.write("usage: bootstrap:catalog -- <imos-sample.json>\n");
  process.exit(2);
}

const raw = await readFile(fixturePath, "utf8");
const data = JSON.parse(raw) as ImosRoot;
const machines = extractMachines(data);

process.stdout.write(`bootstrap: source=${fixturePath}\n`);
process.stdout.write(`extracted ${machines.length} unique machine code(s)\n`);

const report = await seed(machines);

process.stdout.write("\n=== stations ===\n");
process.stdout.write(`  added=${report.stations.added}  skipped=${report.stations.skipped}  total_seed=${report.stations.total}\n`);
process.stdout.write("\n=== machines ===\n");
process.stdout.write(`  added=${report.machines.added}  skipped=${report.machines.skipped}  total_extracted=${report.machines.total}\n`);
if (report.unknown_models.length > 0) {
  process.stdout.write(`\nunknown prefix → classified as generic/cnc (supervisor should review):\n`);
  for (const m of report.unknown_models) process.stdout.write(`  - ${m}\n`);
}

await pool.end();
