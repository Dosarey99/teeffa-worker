import type { QuoteInput, EngineeringResult, PricingResult, Brand } from "./types";

const BRAND_MULTIPLIER: Record<Brand, number> = {
  Schneider: 1.30,
  ABB: 1.20,
  Siemens: 1.15,
  LS: 1.00,
  CHINT: 0.80,
  Generic: 0.75,
};

function mainBreakerBasePrice(amp: number, type: string): number {
  if (type === "MCB") return Math.max(80, amp * 4);
  if (type === "MCCB") {
    if (amp <= 160) return 650;
    if (amp <= 250) return 1100;
    if (amp <= 400) return 1900;
    if (amp <= 630) return 3500;
    return 5200;
  }
  if (type === "ACB") {
    if (amp <= 1000) return 9500;
    if (amp <= 1600) return 14500;
    return 22000;
  }
  return amp * 8;
}

function round(n: number, d = 2): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export function runPricing(inp: QuoteInput, engineering: EngineeringResult): PricingResult {
  const brandFactor = BRAND_MULTIPLIER[inp.brand] ?? 1.0;
  const { recommended_main_breaker_amp: recAmp, recommended_breaker_type: recType, selected_busbar: busbar, sheet_metal: sheetMetal, design_current_a: designCurrent, selected_cable: cable } = engineering;

  const COPPER_KG_PRICE = 55;
  const STEEL_KG_PRICE = 6;
  const LABOR_RATE = 85;

  const mainBreakerPrice = mainBreakerBasePrice(recAmp, recType) * brandFactor;
  const outgoingUnitPrice = (recType === "MCB" ? 140 : 260) * brandFactor;
  const outgoingBreakersPrice = inp.outgoing_breakers_count * outgoingUnitPrice;

  const copperCost = busbar.estimated_weight_kg * COPPER_KG_PRICE;
  const sheetMetalCost = sheetMetal.weight_kg * STEEL_KG_PRICE;
  const enclosureFabCost = sheetMetalCost + 1200;
  const paintCost = inp.ip_rating !== "IP65" ? 450 : 700;
  const accessoriesCost = 650 + inp.outgoing_breakers_count * 35;
  const wiringCost = 300 + designCurrent * 2.5;

  let laborHours = 8 + inp.outgoing_breakers_count * 0.35 + designCurrent / 100;
  if (inp.has_motors) laborHours += 2;
  if (inp.has_generator) laborHours += 3;
  const laborCost = laborHours * LABOR_RATE;

  const bom = [
    { item: "Main Breaker", spec: `${recType} ${recAmp}A ${inp.brand}`, qty: 1, unit_price_sar: round(mainBreakerPrice), total_sar: round(mainBreakerPrice) },
    { item: "Outgoing Breakers", spec: `Average outgoing breakers - ${inp.brand}`, qty: inp.outgoing_breakers_count, unit_price_sar: round(outgoingUnitPrice), total_sar: round(outgoingBreakersPrice) },
    { item: "Copper Busbar", spec: busbar.description, qty: busbar.estimated_weight_kg, unit_price_sar: COPPER_KG_PRICE, total_sar: round(copperCost) },
    { item: "Sheet Metal", spec: "2mm galvanized steel estimated weight", qty: sheetMetal.weight_kg, unit_price_sar: STEEL_KG_PRICE, total_sar: round(sheetMetalCost) },
    { item: "Enclosure Fabrication", spec: "Cutting, bending, welding", qty: 1, unit_price_sar: round(enclosureFabCost), total_sar: round(enclosureFabCost) },
    { item: "Painting", spec: `Powder coating / finish for ${inp.ip_rating}`, qty: 1, unit_price_sar: paintCost, total_sar: paintCost },
    { item: "Accessories", spec: "DIN rail, terminals, labels, glands, locks", qty: 1, unit_price_sar: round(accessoriesCost), total_sar: round(accessoriesCost) },
    { item: "Internal Wiring", spec: cable.description, qty: 1, unit_price_sar: round(wiringCost), total_sar: round(wiringCost) },
    { item: "Labor", spec: `Estimated ${laborHours.toFixed(1)} hours`, qty: round(laborHours, 1), unit_price_sar: LABOR_RATE, total_sar: round(laborCost) },
  ];

  const directCost = bom.reduce((sum, row) => sum + row.total_sar, 0);
  const overhead = directCost * 0.10;
  const profit = (directCost + overhead) * 0.20;
  const finalPrice = directCost + overhead + profit;

  return {
    brand_factor: brandFactor,
    bom,
    summary: {
      direct_cost_sar: round(directCost),
      overhead_sar: round(overhead),
      profit_sar: round(profit),
      final_price_sar: round(finalPrice),
      labor_hours: round(laborHours, 1),
    },
  };
}
