import type { QuoteInput, EngineeringResult, PricingResult, RulesResult, RuleItem, DecisionLevel } from "./types";

export function runRules(inp: QuoteInput, engineering: EngineeringResult, pricing?: PricingResult): RulesResult {
  const items: RuleItem[] = [];
  const { calculated_current_a: calc, design_current_a: design, recommended_main_breaker_amp: recAmp, recommended_breaker_type: recType, recommended_dimensions: dims } = engineering;

  if (inp.main_breaker_amp < calc) {
    items.push({ level: "FAIL", code: "BREAKER_UNDERSIZED", message: `القاطع المدخل ${inp.main_breaker_amp}A أقل من التيار المحسوب ${calc}A.` });
  } else if (inp.main_breaker_amp < design) {
    items.push({ level: "WARNING", code: "BREAKER_MARGIN_LOW", message: `القاطع المدخل ${inp.main_breaker_amp}A يغطي الحمل، لكنه أقل من تيار التصميم ${design}A. المقترح ${recAmp}A.` });
  } else {
    items.push({ level: "PASS", code: "BREAKER_OK", message: `القاطع الرئيسي المدخل ${inp.main_breaker_amp}A مناسب مبدئيًا.` });
  }

  if (inp.breaker_type !== recType) {
    const severity: DecisionLevel = (inp.main_breaker_amp > 100 && inp.breaker_type === "MCB") ? "FAIL" : "WARNING";
    items.push({ level: severity, code: "BREAKER_TYPE_MISMATCH", message: `نوع القاطع المدخل ${inp.breaker_type} لا يطابق النوع المقترح ${recType}.` });
  } else {
    items.push({ level: "PASS", code: "BREAKER_TYPE_OK", message: `نوع القاطع ${inp.breaker_type} مناسب حسب التيار.` });
  }

  if (inp.width_mm && inp.width_mm < dims.recommended_width_mm) {
    items.push({ level: "WARNING", code: "PANEL_WIDTH_LOW", message: `عرض اللوحة المدخل ${inp.width_mm}mm أقل من المقترح ${dims.recommended_width_mm}mm.` });
  }
  if (inp.height_mm && inp.height_mm < dims.recommended_height_mm) {
    items.push({ level: "WARNING", code: "PANEL_HEIGHT_LOW", message: `ارتفاع اللوحة المدخل ${inp.height_mm}mm أقل من المقترح ${dims.recommended_height_mm}mm.` });
  }
  if (inp.depth_mm && inp.depth_mm < dims.recommended_depth_mm) {
    items.push({ level: "WARNING", code: "PANEL_DEPTH_LOW", message: `عمق اللوحة المدخل ${inp.depth_mm}mm أقل من المقترح ${dims.recommended_depth_mm}mm.` });
  }

  if (inp.has_motors && inp.main_breaker_amp < recAmp) {
    items.push({ level: "WARNING", code: "MOTOR_STARTING_CURRENT", message: "يوجد محركات. يجب مراعاة تيار البدء والـ derating قبل الاعتماد النهائي." });
  }

  if (inp.has_generator && inp.panel_type !== "ATS") {
    items.push({ level: "WARNING", code: "GENERATOR_WITHOUT_ATS", message: "يوجد مولد، لكن نوع اللوحة ليس ATS. راجع طريقة التحويل والحماية." });
  }

  if (inp.ip_rating === "IP42" && (inp.has_motors || inp.has_generator)) {
    items.push({ level: "WARNING", code: "IP_RATING_LOW", message: "IP42 قد يكون منخفضًا حسب بيئة التشغيل. راجع موقع التركيب والتهوية." });
  }

  if (pricing && inp.engineer_price != null) {
    const { final_price_sar: finalPrice, direct_cost_sar: directCost } = pricing.summary;
    if (inp.engineer_price > finalPrice * 1.25) {
      items.push({ level: "WARNING", code: "PRICE_TOO_HIGH", message: `سعر المهندس ${inp.engineer_price.toLocaleString("en-SA", { maximumFractionDigits: 0 })} SAR أعلى من السعر المحسوب بأكثر من 25%.` });
    } else if (inp.engineer_price < directCost * 1.10) {
      items.push({ level: "FAIL", code: "PRICE_LOSS_RISK", message: `سعر المهندس ${inp.engineer_price.toLocaleString("en-SA", { maximumFractionDigits: 0 })} SAR قريب من التكلفة المباشرة أو أقل من هامش أمان الربح.` });
    } else {
      items.push({ level: "PASS", code: "PRICE_OK", message: "سعر المهندس ضمن نطاق منطقي مقارنة بالتكلفة المحسوبة." });
    }
  }

  const levels = items.map((i) => i.level);
  const decision: DecisionLevel = levels.includes("FAIL") ? "FAIL" : levels.includes("WARNING") ? "WARNING" : "PASS";

  return {
    decision,
    items,
    fail_count: levels.filter((l) => l === "FAIL").length,
    warning_count: levels.filter((l) => l === "WARNING").length,
    pass_count: levels.filter((l) => l === "PASS").length,
  };
}
