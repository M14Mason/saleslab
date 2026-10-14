// GitHub Pages mode: no server. Data lives in this browser (localStorage),
// Claude is called directly with the user's own key, stored only on this device.
import { z } from "zod";
import { buyerSystemPrompt, parseOutcome, WOLF, type Difficulty } from "../../shared/wolf";
import { CoachReportSchema, MAX_TURNS, type CoachReport } from "../../shared/schemas";
import { buildCoachPrompt, COACH_SYSTEM } from "../../shared/coach-prompt";

const KEY = "saleslab.apiKey";
const DB = "saleslab.db";
export const BUYER_MODEL = "claude-haiku-5-5";
export const COACH_MODEL = "claude-sonnet-5-5";

export function getKey(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
export function setKey(k: string | null) { try { if (k) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY); } catch { /* blocked */ } }

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;
function load(): Store { try { return JSON.parse(localStorage.getItem(DB) || "{}"); } catch { return {}; } }
function save(s: Store) { localStorage.setItem(DB, JSON.stringify(s)); }

// Minimal supabase-js-compatible query builder over localStorage.
function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row = {};
  let orderKey: string | null = null, asc = true, lim = Infinity;
  const exec = () => {
    const s = load();
    const rows = (s[table] ??= []);
    const match = (r: Row) => filters.every((f) => f(r));
    let out: Row[];
    if (op === "insert") {
      const row = { id: crypto.randomUUID(), status: "active", started_at: new Date().toISOString(), created_at: new Date().toISOString(), ...payload };
      rows.push(row); out = [row];
    } else if (op === "update") { out = rows.filter(match); out.forEach((r) => Object.assign(r, payload)); }
    else if (op === "delete") {
      const gone = rows.filter(match).map((r) => r.id);
      s[table] = rows.filter((r) => !match(r));
      if (table === "sessions") for (const t of ["messages", "reports"]) s[t] = (s[t] ?? []).filter((r) => !gone.includes(r.session_id));
      out = [];
    } else out = rows.filter(match);
    if (op !== "select") save(s);
    if (orderKey) { const k = orderKey; out = [...out].sort((a, b) => String(a[k]).localeCompare(String(b[k]), undefined, { numeric: true }) * (asc ? 1 : -1)); }
    return out.slice(0, lim);
  };
  const q = {
    select: () => q,
    insert: (p: Row) => { op = "insert"; payload = p; return q; },
    update: (p: Row) => { op = "update"; payload = p; return q; },
    delete: () => { op = "delete"; return q; },
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
    neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
    gte: (k: string, v: string) => { filters.push((r) => String(r[k]) >= v); return q; },
    order: (k: string, o?: { ascending?: boolean }) => { orderKey = k; asc = o?.ascending ?? true; return q; },
    limit: (n: number) => { lim = n; return q; },
    single: async () => { const r = exec()[0]; return { data: r ?? null, error: r ? null : new Error("not found") }; },
    maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
    then: (res: (v: { data: Row[]; error: null }) => void, rej?: (e: unknown) => void) => {
      try { res({ data: exec(), error: null }); } catch (e) { rej?.(e); }
    },
  };
  return q;
}

const user = { id: "local", email: "this device" };
const session = { access_token: "local", user };
export const localClient = {
  from,
  rpc: async () => { localStorage.removeItem(DB); setKey(null); return { error: null }; },
  auth: {
    getSession: async () => ({ data: { session: getKey() ? session : null } }),
    onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
      const h = () => cb("CHANGE", getKey() ? session : null);
      window.addEventListener("saleslab-auth", h);
      return { data: { subscription: { unsubscribe: () => window.removeEventListener("saleslab-auth", h) } } };
    },
    signOut: async () => { setKey(null); window.dispatchEvent(new Event("saleslab-auth")); return { error: null }; },
    updateUser: async () => ({ error: new Error("No password in device mode.") }),
  },
};
export const notifyAuth = () => window.dispatchEvent(new Event("saleslab-auth"));

async function claude(body: Record<string, unknown>) {
  const key = getKey();
  if (!key) throw new Error("Add your Claude API key in Settings.");
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
  } catch { throw new Error("No connection. Check your internet."); }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("Claude rejected your API key. Re-enter it in Settings.");
  if (res.status === 429) throw new Error("Rate limited. Wait a few seconds.");
  if (!res.ok) throw new Error(json?.error?.message || `Claude error (${res.status})`);
  return json as { content: { type: string; text?: string; input?: unknown }[]; stop_reason: string };
}

export async function localConverse(sessionId: string, idx: number, text: string) {
  const s = load();
  const sess = (s.sessions ?? []).find((r) => r.id === sessionId);
  if (!sess) throw new Error("Session not found");
  const msgs = (s.messages ?? []).filter((m) => m.session_id === sessionId).sort((a, b) => Number(a.idx) - Number(b.idx));
  const existing = msgs.find((m) => m.idx === idx + 1);
  if (existing) { const p = parseOutcome(String(existing.text)); return { reply: p.text, outcome: p.outcome }; }
  if (idx >= MAX_TURNS * 2) throw new Error("Turn limit reached. End the call for coaching.");
  const convo = [...msgs.filter((m) => Number(m.idx) < idx), { role: "seller", text }].map((m) => ({
    role: m.role === "seller" ? "user" : "assistant", content: String(m.text),
  }));
  const res = await claude({
    model: BUYER_MODEL, max_tokens: 160,
    system: `${buyerSystemPrompt(sess.difficulty as Difficulty)}\n\nYou already opened the call by saying: "${WOLF.opener}"`,
    messages: convo,
  });
  const raw = res.content.map((b) => b.text ?? "").join(" ").trim() || "Talk to me.";
  const s2 = load();
  s2.messages = (s2.messages ?? []).filter((m) => !(m.session_id === sessionId && Number(m.idx) >= idx));
  const now = new Date().toISOString();
  s2.messages.push({ session_id: sessionId, idx, role: "seller", text, created_at: now }, { session_id: sessionId, idx: idx + 1, role: "buyer", text: raw, created_at: now });
  save(s2);
  const p = parseOutcome(raw);
  return { reply: p.text, outcome: p.outcome };
}

let coaching = false;
export async function localCoach(sessionId: string): Promise<{ report: CoachReport; cached: boolean }> {
  const s = load();
  const cached = (s.reports ?? []).find((r) => r.session_id === sessionId);
  if (cached) return { report: cached.report as CoachReport, cached: true };
  if (coaching) throw new Error("Coaching already running.");
  const sess = (s.sessions ?? []).find((r) => r.id === sessionId);
  const msgs = (s.messages ?? []).filter((m) => m.session_id === sessionId).sort((a, b) => Number(a.idx) - Number(b.idx));
  if (!sess || !msgs.some((m) => m.role === "seller")) throw new Error("Nothing to coach yet.");
  const past = (s.reports ?? []).slice(-5).map((r) => (r.report as CoachReport).top_weakness);
  coaching = true;
  try {
    const res = await claude({
      model: COACH_MODEL, max_tokens: 3000, system: COACH_SYSTEM,
      tools: [{ name: "submit_report", description: "Submit the coaching report.", input_schema: z.toJSONSchema(CoachReportSchema) }],
      tool_choice: { type: "tool", name: "submit_report" },
      messages: [{ role: "user", content: buildCoachPrompt(String(sess.difficulty), msgs as never, past) }],
    });
    const valid = CoachReportSchema.safeParse(res.content.find((b) => b.type === "tool_use")?.input);
    if (!valid.success) throw new Error(res.stop_reason === "max_tokens" ? "Report was cut off. Try again." : "Coach returned a bad report. Try again.");
    const s2 = load();
    (s2.reports ??= []).push({ session_id: sessionId, report: valid.data, created_at: new Date().toISOString() });
    const row = (s2.sessions ?? []).find((r) => r.id === sessionId);
    if (row) Object.assign(row, { status: "coached", score: valid.data.overall_score, outcome: valid.data.outcome });
    save(s2);
    return { report: valid.data, cached: false };
  } finally { coaching = false; }
}
