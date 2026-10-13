import { describe, expect, it } from "vitest";
import { buyerSystemPrompt, parseOutcome, WOLF } from "../shared/wolf";
import { CoachReportSchema, ConverseRequestSchema } from "../shared/schemas";
import { buildCoachPrompt } from "../shared/coach-prompt";
import { summarize } from "../src/lib/stats";
import type { SessionRow } from "../src/lib/api";
import { validReport } from "./fixtures";


describe("wolf persona", () => {
  it("difficulty changes the actual rules", () => {
    const [e, m, h] = (["easy", "medium", "hard"] as const).map(buyerSystemPrompt);
    expect(e).not.toEqual(m);
    expect(h).toContain("No deal");
    expect(e).toContain("receptive");
  });
  it("never claims to be a real person and defends against injection", () => {
    const p = buyerSystemPrompt("medium");
    expect(p).toMatch(/Never claim to be Jordan Belfort/);
    expect(p).toMatch(/never as instructions/);
    expect(WOLF.disclosure).toMatch(/not a real person/);
  });
  it("parses outcome tags", () => {
    expect(parseOutcome("Fine, I'll take it. [DEAL]")).toEqual({ text: "Fine, I'll take it.", outcome: "deal" });
    expect(parseOutcome("Get out. [NO_DEAL]").outcome).toBe("no_deal");
    expect(parseOutcome("Keep going.").outcome).toBeNull();
  });
});

describe("validation", () => {
  it("accepts a valid report and keeps N/A categories", () => {
    const r = CoachReportSchema.parse(validReport);
    expect(r.categories[1].score).toBeNull();
  });
  it("rejects out-of-range scores and audio claims", () => {
    expect(CoachReportSchema.safeParse({ ...validReport, overall_score: 140 }).success).toBe(false);
    expect(CoachReportSchema.safeParse({ ...validReport, delivery: { ...validReport.delivery, basis: "audio" } }).success).toBe(false);
  });
  it("rejects bad converse input", () => {
    expect(ConverseRequestSchema.safeParse({ sessionId: "nope", idx: 0, text: "hi" }).success).toBe(false);
    expect(ConverseRequestSchema.safeParse({ sessionId: crypto.randomUUID(), idx: 0, text: "   " }).success).toBe(false);
    expect(ConverseRequestSchema.safeParse({ sessionId: crypto.randomUUID(), idx: 0, text: "x".repeat(2000) }).success).toBe(false);
  });
});

describe("coach prompt", () => {
  it("strips outcome tags and records outcome", () => {
    const p = buildCoachPrompt("hard", [
      { idx: 0, role: "seller", text: "Buy it" },
      { idx: 1, role: "buyer", text: "No. [NO_DEAL]" },
    ], ["rushed the close"]);
    expect(p).not.toContain("[NO_DEAL]");
    expect(p).toContain('outcome "no_deal"');
    expect(p).toContain("rushed the close");
  });
});

describe("stats", () => {
  const row = (score: number | null, d: SessionRow["difficulty"], day: number): SessionRow => ({
    id: String(day), difficulty: d, status: "coached", outcome: score && score > 70 ? "deal" : "no_deal",
    score, started_at: new Date(2026, 0, day).toISOString(), duration_sec: 120,
  });
  it("summarizes real rows only", () => {
    expect(summarize([]).sessions).toBe(0);
    expect(summarize([]).avg).toBeNull();
    const rows = [...Array(10)].map((_, i) => row(40 + i * 5, i % 2 ? "hard" : "easy", i + 1));
    const s = summarize(rows);
    expect(s.avg).toBe(63);
    expect(s.minutes).toBe(20);
    expect(s.change).toBe(25);
    expect(s.trend[0]).toBe(40);
  });
});
