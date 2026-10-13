// MOCKED integration tests: fake Supabase + fake Anthropic. No network, no charges.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validReport } from "./fixtures";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const claudeCalls: unknown[] = [];
let claudeReply: unknown;

// Minimal chainable fake of the supabase-js query builder.
function from(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" | "upsert" = "select";
  let payload: Row | null = null;
  let head = false;
  const q: Record<string, unknown> = {};
  const run = () => {
    tables[table] ??= [];
    const rows = tables[table].filter((r) => filters.every((f) => f(r)));
    if (op === "update") rows.forEach((r) => Object.assign(r, payload));
    if (op === "insert") tables[table].push({ ...payload, created_at: new Date().toISOString() });
    if (op === "upsert") {
      const ex = tables[table].find((r) => r.session_id === payload!.session_id && r.idx === payload!.idx);
      if (ex) Object.assign(ex, payload); else tables[table].push({ ...payload, created_at: new Date().toISOString() });
    }
    return rows;
  };
  Object.assign(q, {
    select: (_c?: string, o?: { head?: boolean }) => { head = Boolean(o?.head); return q; },
    update: (p: Row) => { op = "update"; payload = p; return q; },
    insert: (p: Row) => { op = "insert"; payload = p; return q; },
    upsert: (p: Row) => { op = "upsert"; payload = p; return q; },
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
    in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return q; },
    gte: () => q, order: () => q, limit: () => q,
    single: async () => ({ data: run()[0] ?? null }),
    maybeSingle: async () => ({ data: run()[0] ?? null }),
    then: (res: (v: unknown) => void) => {
      const rows = run();
      res(head ? { count: rows.length } : { data: [...rows].sort((a, b) => Number(a.idx ?? 0) - Number(b.idx ?? 0)), error: null });
    },
  });
  return q;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from,
    auth: {
      getUser: async (t: string) =>
        t === "good" ? { data: { user: { id: "u1" } }, error: null } : t === "other" ? { data: { user: { id: "u2" } }, error: null } : { data: { user: null }, error: new Error("bad") },
    },
  }),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class Anthropic {
    static APIError = APIError;
    messages = { create: async (args: unknown) => { claudeCalls.push(args); return claudeReply; } };
  }
  return { default: Anthropic };
});

process.env.SUPABASE_URL = "http://x";
process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
process.env.ANTHROPIC_API_KEY = "k";

const { POST: converse } = await import("../api/converse");
const { POST: coach } = await import("../api/coach");

const SID = "11111111-1111-4111-8111-111111111111";
const req = (body: unknown, token = "good") =>
  new Request("http://x/api", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  claudeCalls.length = 0;
  tables.sessions = [{ id: SID, user_id: "u1", difficulty: "hard", status: "active" }];
  claudeReply = { content: [{ type: "text", text: "Why would I need a pen?" }], stop_reason: "end_turn" };
});

describe("converse", () => {
  it("rejects missing or bad auth", async () => {
    expect((await converse(req({ sessionId: SID, idx: 0, text: "hi" }, "bad"))).status).toBe(401);
  });
  it("blocks other users' sessions", async () => {
    expect((await converse(req({ sessionId: SID, idx: 0, text: "hi" }, "other"))).status).toBe(404);
  });
  it("replies and persists both turns", async () => {
    const res = await converse(req({ sessionId: SID, idx: 0, text: "This pen is great" }));
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe("Why would I need a pen?");
    expect(tables.messages.map((m) => m.role)).toEqual(["seller", "buyer"]);
  });
  it("retry of the same turn does not call Claude again", async () => {
    await converse(req({ sessionId: SID, idx: 0, text: "hi" }));
    const again = await converse(req({ sessionId: SID, idx: 0, text: "hi" }));
    expect((await again.json()).cached).toBe(true);
    expect(claudeCalls).toHaveLength(1);
  });
  it("rejects ended sessions and out-of-order turns", async () => {
    expect((await converse(req({ sessionId: SID, idx: 4, text: "hi" }))).status).toBe(409);
    tables.sessions[0].status = "ended";
    expect((await converse(req({ sessionId: SID, idx: 0, text: "hi" }))).status).toBe(409);
  });
  it("enforces the daily limit", async () => {
    process.env.DAILY_TURN_LIMIT = "1";
    tables.messages = [{ session_id: "other", user_id: "u1", idx: 1, role: "buyer", text: "x" }];
    expect((await converse(req({ sessionId: SID, idx: 0, text: "hi" }))).status).toBe(429);
    delete process.env.DAILY_TURN_LIMIT;
  });
});

describe("coach", () => {
  beforeEach(() => {
    tables.sessions[0].status = "ended";
    tables.messages = [
      { session_id: SID, user_id: "u1", idx: 0, role: "seller", text: "It writes smooth" },
      { session_id: SID, user_id: "u1", idx: 1, role: "buyer", text: "Pass. [NO_DEAL]" },
    ];
    claudeReply = { content: [{ type: "tool_use", input: validReport }], stop_reason: "tool_use" };
  });
  it("generates, stores, and then serves from cache", async () => {
    const first = await coach(req({ sessionId: SID }));
    expect(first.status).toBe(200);
    expect(tables.sessions[0].status).toBe("coached");
    expect(tables.sessions[0].score).toBe(42);
    const second = await coach(req({ sessionId: SID }));
    expect((await second.json()).cached).toBe(true);
    expect(claudeCalls).toHaveLength(1);
  });
  it("rejects a malformed report without retrying and unlocks the session", async () => {
    claudeReply = { content: [{ type: "tool_use", input: { overall_score: "high" } }], stop_reason: "tool_use" };
    expect((await coach(req({ sessionId: SID }))).status).toBe(502);
    expect(claudeCalls).toHaveLength(1);
    expect(tables.sessions[0].status).toBe("ended");
  });
  it("blocks a duplicate request while coaching is running", async () => {
    tables.sessions[0].status = "coaching";
    expect((await coach(req({ sessionId: SID }))).status).toBe(409);
    expect(claudeCalls).toHaveLength(0);
  });
  it("never serves another user's report", async () => {
    await coach(req({ sessionId: SID }));
    expect((await coach(req({ sessionId: SID }, "other"))).status).toBe(404);
  });
});
