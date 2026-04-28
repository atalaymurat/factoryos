import type { ImosPart } from "../types.js";

/**
 * IMOS ProductionRoute string → Part Contract v2 operations[].
 *
 * Input format (gerçek örnek):
 *   "1_10202_ETQ810&1_&1_10106_BHN510&2_10203_ETQS500&"
 *
 * Token grammar (split by "&"):
 *   "<phase>_<machineId>_<machineModel>"  → geçerli operation
 *   "<phase>_"                            → boş slot, atla
 *   ""                                    → terminator, atla
 *
 * IMOS phase ("1" / "2") preparation faz numaralandırması — assembly/packaging
 * ile karışmasın diye contract phase'ine YANSITILMAZ. Tüm route operasyonları
 * contract phase 1 (preparation) alır; IMOS phase metadata'da saklanır.
 * Adapter sonuna assembly (phase 2) + packaging (phase 3) auto-append eder.
 *
 * Hardware part (Typ=8) ProductionRoute taşımaz — sadece tek assembly op.
 */

export type ContractStation =
  | "cutting"
  | "banding"
  | "cnc"
  | "assembly"
  | "packaging";

export interface ContractOperation {
  sequence: number;
  phase: number;
  station: ContractStation;
  preferred_machine_code: string | null;
  alternative_machine_codes: string[];
  required_capabilities: string[];
  required: boolean;
  details: Record<string, unknown>;
}

// Machine model prefix → contract station. adapters-reference.md tablosu.
// Bilinmeyen prefix → "cnc" (en güvenli default; CNC istasyonu generic kabul eder).
function stationForMachineModel(model: string): ContractStation {
  const m = model.toUpperCase();
  if (m.startsWith("BHN")) return "cutting";
  if (m.startsWith("ETQ") || m.startsWith("DTQ")) return "banding";
  if (
    m.startsWith("BHH") ||
    m.startsWith("BHX") ||
    m.startsWith("MLK") ||
    m.startsWith("JP_DH")
  ) {
    return "cnc";
  }
  return "cnc";
}

interface RouteToken {
  imosPhase: string;
  machineCode: string; // "10202_ETQ810" — IMOS'un kullandığı tam form
  machineModel: string;
}

function parseRouteTokens(route: string): RouteToken[] {
  const out: RouteToken[] = [];
  for (const raw of route.split("&")) {
    if (!raw) continue; // terminator
    const parts = raw.split("_");
    if (parts.length < 3) continue; // boş slot ya da bozuk token
    const [phase, machineId, ...rest] = parts;
    const model = rest.join("_"); // model adında "_" varsa korur (JP_DH gibi)
    if (!machineId || !model) continue;
    out.push({
      imosPhase: phase ?? "",
      machineCode: `${machineId}_${model}`,
      machineModel: model,
    });
  }
  return out;
}

function preparationOps(route: string | undefined): ContractOperation[] {
  if (!route) return [];
  const tokens = parseRouteTokens(route);
  return tokens.map((t, i) => ({
    sequence: i + 1,
    phase: 1,
    station: stationForMachineModel(t.machineModel),
    preferred_machine_code: t.machineCode,
    alternative_machine_codes: [],
    required_capabilities: [],
    required: true,
    details: { imos_phase: t.imosPhase },
  }));
}

function tailOps(startSeq: number): ContractOperation[] {
  return [
    {
      sequence: startSeq,
      phase: 2,
      station: "assembly",
      preferred_machine_code: null,
      alternative_machine_codes: [],
      required_capabilities: [],
      required: true,
      details: {},
    },
    {
      sequence: startSeq + 1,
      phase: 3,
      station: "packaging",
      preferred_machine_code: null,
      alternative_machine_codes: [],
      required_capabilities: [],
      required: true,
      details: {},
    },
  ];
}

export function buildPartOperations(part: ImosPart): ContractOperation[] {
  // Hardware: sadece assembly (packaging yok — hardware paketlemeye girmez,
  // mfg parça ile birlikte sub_module kit'te ilerler).
  if (part["#Typ"] === "8") {
    return [
      {
        sequence: 1,
        phase: 2,
        station: "assembly",
        preferred_machine_code: null,
        alternative_machine_codes: [],
        required_capabilities: [],
        required: true,
        details: {},
      },
    ];
  }
  const prep = preparationOps(part.ProductionRoute);
  const tail = tailOps(prep.length + 1);
  return [...prep, ...tail];
}
