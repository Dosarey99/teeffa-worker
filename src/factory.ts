import type { QuoteReport } from "./types";

export function buildFactoryMessage(report: QuoteReport): string {
  const { input: inp, engineering: eng, rules, pricing } = report;
  const dims = eng.final_dimensions;

  const issues = rules.items
    .filter((i) => i.level !== "PASS")
    .map((i) => `- [${i.level}] ${i.message}`)
    .join("\n") || "- لا توجد ملاحظات حرجة في المراجعة الأولية.";

  return `طلب تصنيع / مراجعة لوحة كهربائية - TEEFFA

المشروع: ${inp.project_name}
العميل: ${inp.customer_name}
نوع اللوحة: ${inp.panel_type}
الفاز: ${inp.phase}
الجهد: ${inp.voltage}V
القدرة: ${inp.power_kw} kW
PF: ${inp.power_factor}

التيار المحسوب: ${eng.calculated_current_a} A
تيار التصميم: ${eng.design_current_a} A
القاطع المقترح: ${eng.recommended_breaker_type} ${eng.recommended_main_breaker_amp}A
الكابل المقترح: ${eng.selected_cable.description}
البسبار: ${eng.selected_busbar.description}

أبعاد اللوحة:
W ${dims.width_mm}mm x H ${dims.height_mm}mm x D ${dims.depth_mm}mm
IP: ${inp.ip_rating}
البراند: ${inp.brand}

قرار النظام: ${rules.decision}
الملاحظات:
${issues}

السعر النهائي المقترح: ${pricing.summary.final_price_sar.toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`.trim();
}

export function buildWhatsappUrl(message: string, phone?: string): string {
  const encoded = encodeURIComponent(message);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
