import type { QuoteInput, CableEntry, BusbarEntry, EngineeringResult } from "./types";

const STANDARD_BREAKERS = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200];

const CABLE_TABLE: CableEntry[] = [
  { max_amp: 25, size_mm2: 4, description: "Cu 4 mm²" },
  { max_amp: 40, size_mm2: 6, description: "Cu 6 mm²" },
  { max_amp: 63, size_mm2: 10, description: "Cu 10 mm²" },
  { max_amp: 80, size_mm2: 16, description: "Cu 16 mm²" },
  { max_amp: 100, size_mm2: 25, description: "Cu 25 mm²" },
  { max_amp: 125, size_mm2: 35, description: "Cu 35 mm²" },
  { max_amp: 160, size_mm2: 50, description: "Cu 50 mm²" },
  { max_amp: 200, size_mm2: 70, description: "Cu 70 mm²" },
  { max_amp: 250, size_mm2: 95, description: "Cu 95 mm²" },
  { max_amp: 320, size_mm2: 120, description: "Cu 120 mm²" },
  { max_amp: 400, size_mm2: 185, description: "Cu 185 mm²" },
  { max_amp: 500, size_mm2: 240, description: "Cu 240 mm²" },
  { max_amp: 630, size_mm2: 300, description: "Cu 300 mm²" },
  { max_amp: 800, size_mm2: "2 x 240", description: "2 runs Cu 240 mm²" },
  { max_amp: 1000, size_mm2: "2 x 300", description: "2 runs Cu 300 mm²" },
  { max_amp: 1250, size_mm2: "3 x 300", description: "3 runs Cu 300 mm²" },
  { max_amp: 1600, size_mm2: "4 x 300", description: "4 runs Cu 300 mm²" },
  { max_amp: 2500, size_mm2: "Engineering Review", description: "Requires detailed cable study" },
  { max_amp: 3200, size_mm2: "Engineering Review", description: "Requires detailed cable study" },
];

const BUSBAR_TABLE: BusbarEntry[] = [
  { max_amp: 100, width_mm: 20, thickness_mm: 3, bars_per_phase: 1 },
  { max_amp: 160, width_mm: 25, thickness_mm: 5, bars_per_phase: 1 },
  { max_amp: 250, width_mm: 30, thickness_mm: 5, bars_per_phase: 1 },
  { max_amp: 400, width_mm: 40, thickness_mm: 5, bars_per_phase: 1 },
  { max_amp: 630, width_mm: 50, thickness_mm: 10, bars_per_phase: 1 },
  { max_amp: 800, width_mm: 60, thickness_mm: 10, bars_per_phase: 1 },
  { max_amp: 1000, width_mm: 80, thickness_mm: 10, bars_per_phase: 1 },
  { max_amp: 1250, width_mm: 100, thickness_mm: 10, bars_per_phase: 1 },
  { max_amp: 1600, width_mm: 80, thickness_mm: 10, bars_per_phase: 2 },
  { max_amp: 2000, width_mm: 100, thickness_mm: 10, bars_per_phase: 2 },
  { max_amp: 2500, width_mm: 120, thickness_mm: 10, bars_per_phase: 2 },
  { max_amp: 3200, width_mm: 120, thickness_mm: 10, bars_per_phase: 3 },
];

function nextStandardBreaker(amps: number): number {
  for (const b of STANDARD_BREAKERS) {
    if (b >= amps) return b;
  }
  return STANDARD_BREAKERS[STANDARD_BREAKERS.length - 1];
}

function breakerFamily(amps: number): "MCB" | "MCCB" | "ACB" {
  if (amps <= 63) return "MCB";
  if (amps <= 630) return "MCCB";
  return "ACB";
}

function selectCable(designCurrent: number): CableEntry {
  for (const row of CABLE_TABLE) {
    if (row.max_amp >= designCurrent) return row;
  }
  return CABLE_TABLE[CABLE_TABLE.length - 1];
}

function selectBusbar(designCurrent: number): BusbarEntry {
  for (const row of BUSBAR_TABLE) {
    if (row.max_amp >= designCurrent) return row;
  }
  return BUSBAR_TABLE[BUSBAR_TABLE.length - 1];
}

function estimateDimensions(inp: QuoteInput, designCurrent: number) {
  const rows = Math.max(1, Math.ceil(inp.outgoing_breakers_count / 12));
  let baseWidth: number, baseHeight: number, baseDepth: number;

  if (designCurrent <= 125) {
    [baseWidth, baseHeight, baseDepth] = [600, 800, 250];
  } else if (designCurrent <= 250) {
    [baseWidth, baseHeight, baseDepth] = [800, 1200, 300];
  } else if (designCurrent <= 630) {
    [baseWidth, baseHeight, baseDepth] = [1000, 1800, 400];
  } else if (designCurrent <= 1250) {
    [baseWidth, baseHeight, baseDepth] = [1200, 2000, 600];
  } else {
    [baseWidth, baseHeight, baseDepth] = [1600, 2200, 800];
  }

  const extraHeight = Math.max(0, rows - 3) * 180;
  const extraWidth = (inp.has_generator || inp.panel_type === "ATS") ? 200 : 0;
  const motorSpace = inp.has_motors ? 200 : 0;

  return {
    recommended_width_mm: baseWidth + extraWidth,
    recommended_height_mm: baseHeight + extraHeight,
    recommended_depth_mm: baseDepth + motorSpace,
    breaker_rows: rows,
  };
}

function sheetMetalWeight(w: number, h: number, d: number) {
  const area = 2 * ((w / 1000) * (h / 1000) + (w / 1000) * (d / 1000) + (h / 1000) * (d / 1000));
  const weight = area * 0.002 * 7850;
  return { area_m2: round(area, 2), weight_kg: round(weight, 2) };
}

function busbarWeight(busbar: BusbarEntry, heightMm: number): number {
  const length = Math.max(1.0, (heightMm / 1000) * 0.75);
  const qty = busbar.bars_per_phase * 4;
  return round((busbar.width_mm / 1000) * (busbar.thickness_mm / 1000) * length * 8960 * qty, 2);
}

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

export function runEngine(inp: QuoteInput): EngineeringResult {
  const powerW = inp.power_kw * 1000;
  const calculatedCurrent =
    inp.phase === "3PH"
      ? powerW / (Math.sqrt(3) * inp.voltage * inp.power_factor)
      : powerW / (inp.voltage * inp.power_factor);

  const demandCurrent = calculatedCurrent * inp.diversity_factor;
  let margin = inp.has_motors ? 1.25 : 1.15;
  if (inp.has_generator) margin += 0.05;
  const designCurrent = demandCurrent * margin;

  const recommendedBreakerAmp = nextStandardBreaker(designCurrent);
  const recommendedBreakerType = breakerFamily(recommendedBreakerAmp);
  const cable = selectCable(designCurrent);
  const busbar = selectBusbar(designCurrent);
  const dimensions = estimateDimensions(inp, designCurrent);

  const finalWidth = inp.width_mm ?? dimensions.recommended_width_mm;
  const finalHeight = inp.height_mm ?? dimensions.recommended_height_mm;
  const finalDepth = inp.depth_mm ?? dimensions.recommended_depth_mm;

  const sheetMetal = sheetMetalWeight(finalWidth, finalHeight, finalDepth);
  const busbarWeightKg = busbarWeight(busbar, finalHeight);

  return {
    calculated_current_a: round(calculatedCurrent, 2),
    demand_current_a: round(demandCurrent, 2),
    design_current_a: round(designCurrent, 2),
    safety_margin_factor: round(margin, 2),
    recommended_main_breaker_amp: recommendedBreakerAmp,
    recommended_breaker_type: recommendedBreakerType,
    selected_cable: cable,
    selected_busbar: {
      ...busbar,
      description: `${busbar.bars_per_phase} x ${busbar.width_mm}x${busbar.thickness_mm} mm per phase`,
      estimated_weight_kg: busbarWeightKg,
    },
    recommended_dimensions: dimensions,
    final_dimensions: { width_mm: finalWidth, height_mm: finalHeight, depth_mm: finalDepth },
    sheet_metal: sheetMetal,
  };
}
