import type { ImosPart } from "../types.js";
import { findPartSubelements, nullIfBlank } from "../utils.js";

/**
 * IMOS Type 10 (element) → Part Contract v2 part.machining_features[].
 *
 * Wrapper key "element". Part'ın 1 seviye derin subelement'ı (parent.ID =
 * part.ID, fixture'da 120/120 eşleşiyor). Her element CNC geometri detayı
 * (oluk, delik, cep, kesim koordinatları + makine).
 *
 * MVP'de saklanır ama kullanılmaz — Part Contract'ta yer alır, ileride
 * (Phase 2 makine entegrasyonu) CNC programı doğrulamada kullanılacak.
 *
 * Mapping:
 *   TYPE         → feature_type ("groove" | "drill_hole" | "pocket" | "cut" | ...)
 *   MACHINING    → machining (genelde "cut")
 *   PosX/Y/Z     → position.{x, y, z}    (start koordinatı)
 *   OutPosX/Y/Z  → end_position.{x, y, z} (end koordinatı; oluk uzunluğu için)
 *   Width        → dimensions.width_mm
 *   Thickness    → dimensions.depth_mm
 *   (drill için) → dimensions.diameter_mm — IMOS'ta ayrı alan yok, TYPE
 *                  drill_hole ise width=diameter kabul edilebilir; şimdilik
 *                  null bırakılır (MVP kullanmıyor).
 *   MachineName  → machine_code (route/programs ile aynı format)
 *   Workflow     → metadata.workflow (CNC iş zinciri preset adı)
 *   ID           → metadata.source_id
 */

interface RawImosElement {
  ID?: string;
  TYPE?: string;
  MACHINING?: string;
  PosX?: string;
  PosY?: string;
  PosZ?: string;
  OutPosX?: string;
  OutPosY?: string;
  OutPosZ?: string;
  Width?: string;
  Thickness?: string;
  MachineName?: string;
  Workflow?: string;
}

export interface ContractFeatureCoord {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface ContractFeatureDimensions {
  width_mm: number | null;
  depth_mm: number | null;
  diameter_mm: number | null;
}

export interface ContractMachiningFeature {
  feature_type: string | null;
  machining: string | null;
  position: ContractFeatureCoord;
  end_position: ContractFeatureCoord;
  dimensions: ContractFeatureDimensions;
  machine_code: string | null;
  metadata: Record<string, unknown>;
}

function parseNumber(input: string | undefined): number | null {
  if (!input) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function toContractFeature(e: RawImosElement): ContractMachiningFeature {
  const metadata: Record<string, unknown> = {};
  if (nullIfBlank(e.ID)) metadata.source_id = nullIfBlank(e.ID);
  if (nullIfBlank(e.Workflow)) metadata.workflow = nullIfBlank(e.Workflow);
  return {
    feature_type: nullIfBlank(e.TYPE),
    machining: nullIfBlank(e.MACHINING),
    position: {
      x: parseNumber(e.PosX),
      y: parseNumber(e.PosY),
      z: parseNumber(e.PosZ),
    },
    end_position: {
      x: parseNumber(e.OutPosX),
      y: parseNumber(e.OutPosY),
      z: parseNumber(e.OutPosZ),
    },
    dimensions: {
      width_mm: parseNumber(e.Width),
      depth_mm: parseNumber(e.Thickness),
      diameter_mm: null,
    },
    machine_code: nullIfBlank(e.MachineName),
    metadata,
  };
}

export function buildMachiningFeatures(
  part: ImosPart,
): ContractMachiningFeature[] {
  const elements = findPartSubelements<RawImosElement>(part, "element");
  return elements.map(toContractFeature);
}
