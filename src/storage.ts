import type { Env, QuoteReport } from "./types";

const INDEX_KEY = "projects:index";

interface ProjectMeta {
  id: string;
  created_at: string;
  project_name: string;
  customer_name: string;
  decision: string;
  final_price_sar: number;
}

export async function saveProject(env: Env, report: QuoteReport): Promise<void> {
  await env.PROJECTS_KV.put(`project:${report.id}`, JSON.stringify(report));

  const raw = await env.PROJECTS_KV.get(INDEX_KEY);
  const index: ProjectMeta[] = raw ? JSON.parse(raw) : [];

  const meta: ProjectMeta = {
    id: report.id,
    created_at: report.created_at,
    project_name: report.input.project_name,
    customer_name: report.input.customer_name,
    decision: report.rules.decision,
    final_price_sar: report.pricing.summary.final_price_sar,
  };

  // Prepend, keep newest first
  index.unshift(meta);
  await env.PROJECTS_KV.put(INDEX_KEY, JSON.stringify(index));
}

export async function listProjects(env: Env): Promise<QuoteReport[]> {
  const raw = await env.PROJECTS_KV.get(INDEX_KEY);
  if (!raw) return [];
  const index: ProjectMeta[] = JSON.parse(raw);
  const results = await Promise.all(index.map((m) => getProject(env, m.id)));
  return results.filter((p): p is QuoteReport => p !== null);
}

export async function getProject(env: Env, id: string): Promise<QuoteReport | null> {
  const raw = await env.PROJECTS_KV.get(`project:${id}`);
  return raw ? JSON.parse(raw) : null;
}
