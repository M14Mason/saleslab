import { describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { ACHIEVEMENTS, level, recommend, streak } from "../../src/lib/progress";
import { takeSentences } from "../../src/speech/tts";
import { SCENARIOS } from "../../shared/scenarios";
import { sampleReport, turn } from "./fixtures";

describe("speech sentence splitter (early audio)", () => {
  it("releases complete sentences and keeps the unfinished tail", () => {
    expect(takeSentences("Hey kid. Why would I")).toEqual({ sentences: ["Hey kid."], rest: "Why would I" });
  });
  it("waits for a space after punctuation while streaming", () => {
    expect(takeSentences("Sold.").sentences).toEqual([]);
    expect(takeSentences("Sold.", true).sentences).toEqual(["Sold."]);
  });
  it("flushes leftovers at the end", () => {
    expect(takeSentences("No deal", true)).toEqual({ sentences: ["No deal"], rest: "" });
  });
});

describe("local store", () => {
  it("migrates calls saved by the first version", () => {
    localStorage.setItem("saleslab.db", JSON.stringify({
      sessions: [{ id: "old1", difficulty: "hard", started_at: "2026-10-01T10:00:00Z", score: 61, outcome: "deal", duration_sec: 40 }],
      messages: [{ session_id: "old1", idx: 1, role: "buyer", text: "Sold. [DEAL]" }, { session_id: "old1", idx: 0, role: "seller", text: "Buy it" }],
    }));
    db._reset();
    const s = db.sessions()[0];
    expect(s.turns.map((t) => t.text)).toEqual(["Buy it", "Sold."]);
    expect(s.legacyScore).toBe(61);
    expect(s.scenarioId).toBe("wolf-pen");
  });

  it("exports and re-imports without duplicating calls", () => {
    db.upsertSession({ ...base("a") });
    const json = db.exportJson();
    db.importJson(json);
    expect(db.sessions()).toHaveLength(1);
    expect(() => db.importJson('{"hello":1}')).toThrow(/backup/);
  });

  it("keeps settings defaults when merging partial settings", () => {
    db.setSettings({ pauseMs: 2500 });
    expect(db.settings().pauseMs).toBe(2500);
    expect(db.settings().voiceEngine).toBe("auto");
  });
});

describe("progress", () => {
  it("counts a streak through yesterday", () => {
    const today = new Date(2026, 9, 15, 12);
    const at = (d: number) => base(`x${d}`, new Date(2026, 9, 15 - d, 12).toISOString());
    expect(streak([at(1), at(2), at(3)], today)).toBe(3);
    expect(streak([at(0), at(1)], today)).toBe(2);
    expect(streak([at(2)], today)).toBe(0);
  });
  it("levels up with graded calls", () => {
    expect(level([]).name).toBe("Rookie");
    const many = Array.from({ length: 10 }, (_, i) => ({ ...base(`g${i}`), report: { ...sampleReport, overall_score: 90 } }));
    expect(level(many).name).toBe("Closer");
  });
  it("recommends a scenario for the weakest skill", () => {
    const r = { ...sampleReport, skills: [{ name: "negotiation" as const, score: 20, explanation: "" }, { name: "opening" as const, score: 90, explanation: "" }] };
    expect(recommend([{ ...base("a"), report: r }]).scenario.category).toBe("negotiation");
  });
  it("achievement ids are unique", () => expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length));
});

function base(id: string, startedAt = new Date().toISOString()) {
  return {
    id, scenarioId: "wolf-pen", scenario: SCENARIOS[0], difficulty: "medium" as const, mode: "practice" as const,
    liveCoaching: true, surprise: false, timeLimitSec: null, status: "ended" as const, outcome: null,
    turns: [turn("seller", "hi")], startedAt, endedAt: startedAt, durationSec: 60,
    grading: { status: "idle" as const, error: null, attempts: 0, ms: null }, report: null, metrics: null,
    perf: { firstAudioMs: [], firstTokenMs: [] },
  };
}

describe("data repair (round 2)", () => {
  it("repairs sessions with a missing scenario or bad turns instead of crashing", () => {
    localStorage.setItem("saleslab.v2", JSON.stringify({ version: 2, settings: {}, customScenarios: [], achievements: {},
      sessions: [{ id: "x", scenarioId: "exec-cfo", scenario: null, turns: [null, { role: "seller", text: "hi" }] }, null, { nope: 1 }] }));
    db._reset();
    const s = db.sessions();
    expect(s).toHaveLength(1);
    expect(s[0].scenario.id).toBe("exec-cfo");
    expect(s[0].turns).toHaveLength(1);
    expect(s[0].grading.status).toBe("idle");
  });
});

describe("stale call sweep (round 2)", () => {
  it("ends abandoned calls you spoke in and drops empty ones", () => {
    const old = new Date(Date.now() - 8 * 3600_000).toISOString();
    db.upsertSession({ ...base("spoke", old), status: "active" });
    db.upsertSession({ ...base("empty", old), status: "active", turns: [] });
    db.upsertSession({ ...base("fresh"), status: "active" });
    expect(db.sweepStale()).toBe(2);
    expect(db.session("spoke")!.status).toBe("ended");
    expect(db.session("empty")).toBeNull();
    expect(db.session("fresh")!.status).toBe("active");
  });
});
