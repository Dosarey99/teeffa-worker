import type { QuoteInput, EngineeringResult, LayoutResult } from "./types";

export function buildLayout(inp: QuoteInput, engineering: EngineeringResult): LayoutResult {
  const rows = Math.max(1, Math.ceil(inp.outgoing_breakers_count / 12));
  const breakersPerRow: Array<{ row: number; breakers: number }> = [];
  let remaining = inp.outgoing_breakers_count;
  for (let i = 0; i < rows; i++) {
    const count = Math.min(12, remaining);
    breakersPerRow.push({ row: i + 1, breakers: count });
    remaining -= count;
  }

  const dims = engineering.final_dimensions;

  const zones = [
    { name: "Top Cable Entry", height_percent: 12, description: "Incoming/outgoing cable space" },
    { name: "Main Breaker Zone", height_percent: 18, description: `Main ${engineering.recommended_breaker_type} ${engineering.recommended_main_breaker_amp}A` },
    { name: "Busbar Chamber", height_percent: 18, description: engineering.selected_busbar.description },
    { name: "Outgoing Breaker Rows", height_percent: 38, description: `${rows} rows, max 12 breakers per row` },
    { name: "Spare / Control Space", height_percent: 14, description: "Future expansion and control accessories" },
  ];

  if (inp.panel_type === "ATS" || inp.has_generator) {
    zones.push({ name: "ATS / Generator Control", height_percent: 12, description: "ATS controller, interlock and generator signals" });
  }
  if (inp.has_motors) {
    zones.push({ name: "Motor Control Space", height_percent: 12, description: "Contactors, overloads, VFD or soft starter space" });
  }

  return {
    panel_size: dims,
    breaker_rows: rows,
    breakers_per_row: breakersPerRow,
    zones,
    manufacturing_notes: [
      "Keep busbar chamber separated from control wiring.",
      "Reserve minimum 20% spare wiring space when possible.",
      "Verify heat dissipation before final enclosure approval.",
      "Final layout must be reviewed before fabrication drawing release.",
    ],
  };
}
