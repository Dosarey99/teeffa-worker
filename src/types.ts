export interface Env {
  PROJECTS_KV: KVNamespace;
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
  TEEFFA_TOKEN: string;
  APP_ENV: string;
}

export type PanelType = "MDB" | "SUB_PANEL" | "ATS" | "PUMP_PANEL" | "CONTROL_PANEL";
export type Phase = "1PH" | "3PH";
export type BreakerType = "MCB" | "MCCB" | "ACB";
export type Brand = "Schneider" | "ABB" | "Siemens" | "LS" | "CHINT" | "Generic";
export type IpRating = "IP42" | "IP54" | "IP65";
export type DecisionLevel = "PASS" | "WARNING" | "FAIL";

export interface QuoteInput {
  project_name: string;
  customer_name: string;
  panel_type: PanelType;
  phase: Phase;
  voltage: number;
  power_kw: number;
  power_factor: number;
  diversity_factor: number;
  main_breaker_amp: number;
  breaker_type: BreakerType;
  outgoing_breakers_count: number;
  brand: Brand;
  ip_rating: IpRating;
  has_motors: boolean;
  has_generator: boolean;
  width_mm?: number;
  height_mm?: number;
  depth_mm?: number;
  engineer_price?: number;
  notes?: string;
}

export interface CableEntry {
  max_amp: number;
  size_mm2: number | string;
  description: string;
}

export interface BusbarEntry {
  max_amp: number;
  width_mm: number;
  thickness_mm: number;
  bars_per_phase: number;
}

export interface EngineeringResult {
  calculated_current_a: number;
  demand_current_a: number;
  design_current_a: number;
  safety_margin_factor: number;
  recommended_main_breaker_amp: number;
  recommended_breaker_type: BreakerType;
  selected_cable: CableEntry;
  selected_busbar: BusbarEntry & { description: string; estimated_weight_kg: number };
  recommended_dimensions: { recommended_width_mm: number; recommended_height_mm: number; recommended_depth_mm: number; breaker_rows: number };
  final_dimensions: { width_mm: number; height_mm: number; depth_mm: number };
  sheet_metal: { area_m2: number; weight_kg: number };
}

export interface RuleItem {
  level: DecisionLevel;
  code: string;
  message: string;
}

export interface RulesResult {
  decision: DecisionLevel;
  items: RuleItem[];
  fail_count: number;
  warning_count: number;
  pass_count: number;
}

export interface BomLine {
  item: string;
  spec: string;
  qty: number;
  unit_price_sar: number;
  total_sar: number;
}

export interface PricingResult {
  brand_factor: number;
  bom: BomLine[];
  summary: {
    direct_cost_sar: number;
    overhead_sar: number;
    profit_sar: number;
    final_price_sar: number;
    labor_hours: number;
  };
}

export interface LayoutZone {
  name: string;
  height_percent: number;
  description: string;
}

export interface LayoutResult {
  panel_size: { width_mm: number; height_mm: number; depth_mm: number };
  breaker_rows: number;
  breakers_per_row: Array<{ row: number; breakers: number }>;
  zones: LayoutZone[];
  manufacturing_notes: string[];
}

export interface QuoteReport {
  id: string;
  created_at: string;
  input: QuoteInput;
  engineering: EngineeringResult;
  rules: RulesResult;
  pricing: PricingResult;
  layout: LayoutResult;
  factory_message: string;
  whatsapp_url: string;
}
