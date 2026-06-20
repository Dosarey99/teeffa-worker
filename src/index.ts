import type { Env, QuoteInput } from "./types";
import { runEngine } from "./engineering";
import { runRules } from "./rules";
import { runPricing } from "./pricing";
import { buildLayout } from "./layout";
import { buildFactoryMessage, buildWhatsappUrl } from "./factory";
import { saveProject, listProjects, getProject } from "./storage";

// ── helpers ────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

function err(message: string, status: number): Response {
  return json({ detail: message }, status);
}

function nanoid8(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

// ── auth ──────────────────────────────────────────────────────────────────

function getToken(env: Env): string {
  return env.TEEFFA_TOKEN ?? "demo-static-admin-token";
}

function requireAuth(request: Request, env: Env): Response | null {
  const authHeader = request.headers.get("Authorization") ?? "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const urlToken = new URL(request.url).searchParams.get("token");
  if ((headerToken ?? urlToken) !== getToken(env)) {
    return err("Invalid or missing authorization token", 401);
  }
  return null;
}

// ── input validation ──────────────────────────────────────────────────────

const PANEL_TYPES = new Set(["MDB", "SUB_PANEL", "ATS", "PUMP_PANEL", "CONTROL_PANEL"]);
const PHASES = new Set(["1PH", "3PH"]);
const BREAKER_TYPES = new Set(["MCB", "MCCB", "ACB"]);
const BRANDS = new Set(["Schneider", "ABB", "Siemens", "LS", "CHINT", "Generic"]);
const IP_RATINGS = new Set(["IP42", "IP54", "IP65"]);

function parseQuoteInput(body: Record<string, unknown>): QuoteInput | string {
  const s = (key: string, def: unknown) => (body[key] !== undefined ? body[key] : def);

  const inp: QuoteInput = {
    project_name: String(s("project_name", "New Panel Project")),
    customer_name: String(s("customer_name", "Internal Review")),
    panel_type: String(s("panel_type", "MDB")) as QuoteInput["panel_type"],
    phase: String(s("phase", "3PH")) as QuoteInput["phase"],
    voltage: Number(s("voltage", 400)),
    power_kw: Number(s("power_kw", 75)),
    power_factor: Number(s("power_factor", 0.85)),
    diversity_factor: Number(s("diversity_factor", 1.0)),
    main_breaker_amp: Number(s("main_breaker_amp", 160)),
    breaker_type: String(s("breaker_type", "MCCB")) as QuoteInput["breaker_type"],
    outgoing_breakers_count: Number(s("outgoing_breakers_count", 12)),
    brand: String(s("brand", "Schneider")) as QuoteInput["brand"],
    ip_rating: String(s("ip_rating", "IP54")) as QuoteInput["ip_rating"],
    has_motors: Boolean(s("has_motors", false)),
    has_generator: Boolean(s("has_generator", false)),
    notes: body["notes"] != null ? String(body["notes"]) : "",
  };

  if (body["width_mm"] != null) inp.width_mm = Number(body["width_mm"]);
  if (body["height_mm"] != null) inp.height_mm = Number(body["height_mm"]);
  if (body["depth_mm"] != null) inp.depth_mm = Number(body["depth_mm"]);
  if (body["engineer_price"] != null) inp.engineer_price = Number(body["engineer_price"]);

  if (!PANEL_TYPES.has(inp.panel_type)) return `Invalid panel_type: ${inp.panel_type}`;
  if (!PHASES.has(inp.phase)) return `Invalid phase: ${inp.phase}`;
  if (!BREAKER_TYPES.has(inp.breaker_type)) return `Invalid breaker_type: ${inp.breaker_type}`;
  if (!BRANDS.has(inp.brand)) return `Invalid brand: ${inp.brand}`;
  if (!IP_RATINGS.has(inp.ip_rating)) return `Invalid ip_rating: ${inp.ip_rating}`;
  if (inp.voltage <= 0) return "voltage must be > 0";
  if (inp.power_kw <= 0) return "power_kw must be > 0";
  if (inp.power_factor <= 0 || inp.power_factor > 1) return "power_factor must be in (0, 1]";
  if (inp.diversity_factor <= 0 || inp.diversity_factor > 1.5) return "diversity_factor must be in (0, 1.5]";
  if (inp.main_breaker_amp <= 0) return "main_breaker_amp must be > 0";
  if (inp.outgoing_breakers_count < 0 || inp.outgoing_breakers_count > 120) return "outgoing_breakers_count must be 0–120";

  return inp;
}

// ── router ────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, method } = { pathname: url.pathname, method: request.method };

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
    }

    // ── GET /api/health ──────────────────────────────────────────────────
    if (pathname === "/api/health" && method === "GET") {
      return json({ status: "ok", system: "TEEFFA Engineering Decision System" });
    }

    // ── POST /api/login ──────────────────────────────────────────────────
    if (pathname === "/api/login" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return err("Invalid JSON", 400);
      }

      const adminUser = env.ADMIN_USER ?? "admin";
      const adminPass = env.ADMIN_PASSWORD ?? "admin123";

      if (body["username"] !== adminUser || body["password"] !== adminPass) {
        return err("Invalid username or password", 401);
      }

      return json({ token: getToken(env), role: "admin", username: body["username"] });
    }

    // ── GET /api/dashboard ───────────────────────────────────────────────
    if (pathname === "/api/dashboard" && method === "GET") {
      const authErr = requireAuth(request, env);
      if (authErr) return authErr;

      const projects = await listProjects(env);
      const total = projects.length;
      const passCount = projects.filter((p) => p.decision === "PASS").length;
      const warnCount = projects.filter((p) => p.decision === "WARNING").length;
      const failCount = projects.filter((p) => p.decision === "FAIL").length;
      const totalValue = projects.reduce((s, p) => s + p.final_price_sar, 0);

      return json({
        total_projects: total,
        pass_count: passCount,
        warning_count: warnCount,
        fail_count: failCount,
        total_quoted_value_sar: Math.round(totalValue * 100) / 100,
        expected_profit_sar: Math.round(totalValue * 0.20 * 100) / 100,
        recent_projects: projects.slice(0, 5),
      });
    }

    // ── POST /api/calculate ──────────────────────────────────────────────
    if (pathname === "/api/calculate" && method === "POST") {
      const authErr = requireAuth(request, env);
      if (authErr) return authErr;

      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return err("Invalid JSON", 400);
      }

      const inpOrErr = parseQuoteInput(body);
      if (typeof inpOrErr === "string") return err(inpOrErr, 422);
      const inp = inpOrErr;

      const engineering = runEngine(inp);
      const pricing = runPricing(inp, engineering);
      const rules = runRules(inp, engineering, pricing);
      const layout = buildLayout(inp, engineering);

      const report = {
        id: nanoid8(),
        created_at: new Date().toISOString(),
        input: inp,
        engineering,
        rules,
        pricing,
        layout,
        factory_message: "",
        whatsapp_url: "",
      };

      report.factory_message = buildFactoryMessage(report);
      report.whatsapp_url = buildWhatsappUrl(report.factory_message);

      await saveProject(env, report);
      return json(report);
    }

    // ── GET /api/projects ────────────────────────────────────────────────
    if (pathname === "/api/projects" && method === "GET") {
      const authErr = requireAuth(request, env);
      if (authErr) return authErr;

      const projects = await listProjects(env);
      return json({ projects });
    }

    // ── GET /api/projects/:id ────────────────────────────────────────────
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && method === "GET") {
      const authErr = requireAuth(request, env);
      if (authErr) return authErr;

      const project = await getProject(env, projectMatch[1]);
      if (!project) return err("Project not found", 404);
      return json(project);
    }

    // ── GET /api/projects/:id/factory-message ────────────────────────────
    const factoryMatch = pathname.match(/^\/api\/projects\/([^/]+)\/factory-message$/);
    if (factoryMatch && method === "GET") {
      const authErr = requireAuth(request, env);
      if (authErr) return authErr;

      const project = await getProject(env, factoryMatch[1]);
      if (!project) return err("Project not found", 404);
      const message = project.factory_message;
      return json({ message, whatsapp_url: buildWhatsappUrl(message) });
    }

    return err("Not found", 404);
  },
};
