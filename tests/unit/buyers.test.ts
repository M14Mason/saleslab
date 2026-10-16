import { describe, expect, it } from "vitest";
import { SCENARIOS, voiceFor } from "../../shared/scenarios";
import { GUIDE_IDS, guideFor } from "../../shared/guides";
import { pickVoice } from "../../src/speech/tts";
import { faceUri } from "../../src/components/Face";
import { db } from "../../src/lib/db";

const v = (name: string, lang = "en-US", localService = true) => ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

describe("buyers (round 3)", () => {
  it("has 30+ scenarios including a financial plan close, all with a gender and a guide", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(30);
    expect(SCENARIOS.find((s) => s.id === "financial-plan-close")?.category).toBe("financial-planning");
    for (const s of SCENARIOS) {
      expect(["male", "female"], s.id).toContain(s.persona.gender);
      expect(GUIDE_IDS, `${s.id} needs its own guide`).toContain(s.id);
      const g = guideFor(s);
      expect(g.steps.length).toBeGreaterThanOrEqual(5);
      expect(g.phrases.length).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it("has a real mix of buyers", () => {
    const f = SCENARIOS.filter((s) => s.persona.gender === "female").length;
    expect(f).toBeGreaterThanOrEqual(12);
    expect(SCENARIOS.length - f).toBeGreaterThanOrEqual(12);
    expect(new Set(SCENARIOS.map((s) => s.category)).size).toBeGreaterThanOrEqual(15);
  });

  it("natural voices match the buyer's gender", () => {
    for (const s of SCENARIOS) {
      const n = voiceFor(s.persona).natural;
      expect(n[1], `${s.id} voice ${n}`).toBe(s.persona.gender === "female" ? "f" : "m");
    }
  });

  it("female buyers never get a male device voice (regression: Linda spoke with a man's voice)", () => {
    const all = [v("Daniel"), v("Alex"), v("Samantha"), v("Karen", "en-AU"), v("Google US English", "en-US", false)];
    expect(pickVoice(all, "female", "Linda Park").voice?.name).toMatch(/Samantha|Karen|Google US English/);
    expect(pickVoice(all, "male", "Vince").voice?.name).toMatch(/Daniel|Alex/);
  });

  it("prefers natural/neural voices and flags when no gender match exists", () => {
    const all = [v("Microsoft David"), v("Microsoft Andrew Online (Natural)", "en-US", false), v("Microsoft Zira")];
    expect(pickVoice(all, "male", "x").voice?.name).toContain("Natural");
    const onlyMale = [v("Daniel")];
    expect(pickVoice(onlyMale, "female", "x").genderMatched).toBe(false);
  });

  it("faces render and follow gender", () => {
    const linda = SCENARIOS.find((s) => s.id === "closing-hesitant")!.persona;
    const uri = faceUri(linda, "happy");
    expect(uri.startsWith("data:image/svg+xml")).toBe(true);
    expect(faceUri({ name: "New Person", gender: "female" })).not.toEqual(faceUri({ name: "New Person", gender: "male" }));
  });
});

describe("settings upgrade (round 3)", () => {
  it("moves old defaults to calmer pacing but keeps custom values", () => {
    localStorage.setItem("saleslab.v2", JSON.stringify({ version: 2, sessions: [], customScenarios: [], achievements: {}, settings: { speed: 1.08, pauseMs: 1600 } }));
    db._reset();
    expect(db.settings().speed).toBe(1.0);
    expect(db.settings().pauseMs).toBe(2000);
    localStorage.setItem("saleslab.v2", JSON.stringify({ version: 2, sessions: [], customScenarios: [], achievements: {}, settings: { speed: 1.2, pauseMs: 2500 } }));
    db._reset();
    expect(db.settings().speed).toBe(1.2);
    expect(db.settings().pauseMs).toBe(2500);
    expect(db.settings().brain).toBe("smart");
  });
});
