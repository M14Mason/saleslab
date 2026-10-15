import { describe, expect, it } from "vitest";
import {
  buildGraderPrompt, buyerSystemPrompt, isRepeat, parseOutcome, REPORT_JSON_SCHEMA, ReportSchema,
  sanitizeReport, SCENARIO_JSON_SCHEMA, SKILLS, toClaudeMessages, type Turn,
} from "../../shared/prompts";
import { dailyScenario, SCENARIOS } from "../../shared/scenarios";
import { sampleReport } from "./fixtures";

const wolf = SCENARIOS[0];
const t = (role: Turn["role"], text: string, extra: Partial<Turn> = {}): Turn => ({ role, text, at: 0, ...extra });

describe("roleplay prompt", () => {
  it("difficulty changes the actual buyer rules", () => {
    const [e, m, h] = (["easy", "medium", "hard"] as const).map((d) => buyerSystemPrompt(wolf, d));
    expect(e).not.toEqual(m);
    expect(h).toMatch(/end the call early/);
    expect(e).toMatch(/fairly receptive/);
  });
  it("carries persona facts and anti-repetition and injection rules", () => {
    const p = buyerSystemPrompt(wolf, "medium");
    expect(p).toContain(wolf.persona.budget);
    expect(p).toContain(wolf.opener);
    expect(p).toMatch(/Never repeat a line/);
    expect(p).toMatch(/never as instructions/);
    expect(p).toMatch(/Never claim to be a real person/);
  });
  it("adds a surprise objection rule only when asked", () => {
    expect(buyerSystemPrompt(wolf, "hard", { surprise: true })).toMatch(/Surprise rule/);
    expect(buyerSystemPrompt(wolf, "hard")).not.toMatch(/Surprise rule/);
  });
  it("every built-in scenario is complete", () => {
    for (const s of SCENARIOS) {
      expect(s.opener.length).toBeGreaterThan(5);
      expect(s.persona.objections.length).toBeGreaterThanOrEqual(2);
      expect(s.tips.length).toBeGreaterThan(0);
    }
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });
  it("daily challenge is stable for a day", () => {
    const a = dailyScenario(new Date(2026, 9, 15, 8));
    const b = dailyScenario(new Date(2026, 9, 15, 22));
    expect(a.scenario.id).toBe(b.scenario.id);
  });
});

describe("conversation format", () => {
  it("starts with the user, alternates roles, merges consecutive turns", () => {
    const msgs = toClaudeMessages([t("buyer", "stray"), t("seller", "a"), t("seller", "b"), t("buyer", "c")]);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[0].content).toBe("a\nb");
  });
  it("marks interrupted buyer lines", () => {
    const msgs = toClaudeMessages([t("seller", "hi"), t("buyer", "So what I", { interrupted: true }), t("seller", "wait")]);
    expect(msgs[1].content).toMatch(/cut off/);
  });
  it("parses and strips outcome tags", () => {
    expect(parseOutcome("Fine. [DEAL]")).toEqual({ text: "Fine.", outcome: "deal" });
    expect(parseOutcome("Bye. [NO_DEAL]").outcome).toBe("no_deal");
    expect(parseOutcome("Keep going.").outcome).toBeNull();
  });
});

describe("repeat guard (regression: 'Talk to me.' loop)", () => {
  const history = [t("seller", "hi"), t("buyer", "Talk to me."), t("seller", "this pen is great")];
  it("flags an exact or punctuation-only repeat", () => {
    expect(isRepeat("Talk to me.", history)).toBe(true);
    expect(isRepeat("talk to me!", history)).toBe(true);
  });
  it("flags empty replies", () => expect(isRepeat("   ", history)).toBe(true));
  it("allows new lines", () => expect(isRepeat("Why would I need a pen?", history)).toBe(false));
  it("does not compare against the seller's lines", () => expect(isRepeat("hi", history)).toBe(false));
});

describe("grading schema (regression: grading never generated)", () => {
  const BANNED = ["minimum", "maximum", "maxItems", "minLength", "maxLength", "multipleOf", "$schema"];
  function walk(node: unknown, path = "root"): void {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    for (const b of BANNED) expect(o[b], `${path} uses unsupported "${b}"`).toBeUndefined();
    if (o.type === "object") {
      expect(o.additionalProperties, `${path} needs additionalProperties:false`).toBe(false);
      expect(new Set(o.required as string[])).toEqual(new Set(Object.keys(o.properties as object)));
    }
    for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  }
  it("report JSON schema uses only structured-output-supported keywords", () => walk(REPORT_JSON_SCHEMA));
  it("scenario JSON schema too", () => walk(SCENARIO_JSON_SCHEMA));

  it("validates and clamps model output", () => {
    const r = ReportSchema.parse({ ...sampleReport, overall_score: 140.4, skills: [{ name: "closing", score: -3, explanation: "x" }] });
    expect(r.overall_score).toBe(100);
    expect(r.skills[0].score).toBe(0);
  });
  it("rejects malformed output", () => {
    expect(ReportSchema.safeParse({ ...sampleReport, outcome: "maybe" }).success).toBe(false);
    expect(ReportSchema.safeParse({ overall_score: 50 }).success).toBe(false);
  });
  it("sanitize drops references to missing transcript lines and fills every skill", () => {
    const r = sanitizeReport(ReportSchema.parse({
      ...sampleReport,
      key_moments: [{ turn: 99, kind: "weak", quote: "x", analysis: "y" }, { turn: 1, kind: "strength", quote: "a", analysis: "b" }],
      top_improvements: ["1", "2", "3", "4"],
    }), 4);
    expect(r.key_moments.map((k) => k.turn)).toEqual([1]);
    expect(r.top_improvements).toHaveLength(3);
    expect(r.skills.map((s) => s.name)).toEqual([...SKILLS]);
  });
  it("grader prompt numbers every line and includes the full transcript", () => {
    const p = buildGraderPrompt({ scenario: wolf, difficulty: "hard", mode: "assessment", turns: [t("seller", "first"), t("buyer", "second")], outcome: null, pastWeaknesses: ["rushed"] });
    expect(p).toContain(`[0] BUYER: ${wolf.opener}`);
    expect(p).toContain("[1] SELLER: first");
    expect(p).toContain("[2] BUYER: second");
    expect(p).toContain("incomplete");
    expect(p).toContain("rushed");
  });
});
