import { describe, expect, it } from "vitest";
import { analyze, countFillers, liveHint, splitQuestions } from "../../shared/metrics";
import { turn } from "./fixtures";

describe("transcript metrics", () => {
  it("counts filler words but not 'like' used as a verb", () => {
    expect(countFillers("um so I like this, uh, you know")).toMatchObject({ um: 1, uh: 1, "you know": 1 });
    expect(countFillers("I like it a lot").like).toBeUndefined();
    expect(countFillers("it's like um really good").like).toBe(1);
  });
  it("detects questions even without question marks (speech transcripts)", () => {
    expect(splitQuestions("What do you use now. Do you sign contracts daily")).toHaveLength(2);
    expect(splitQuestions("This pen is blue.")).toHaveLength(0);
  });
  it("computes talk ratio, open questions, longest turn", () => {
    const m = analyze([turn("seller", "How do you sign contracts today?"), turn("buyer", "With a pen. Obviously, kid.")]);
    expect(m.questions).toBe(1);
    expect(m.openQuestions).toBe(1);
    expect(m.talkRatio).toBe(55);
    expect(m.longestTurnWords).toBe(6);
  });
  it("handles an empty call", () => expect(analyze([]).talkRatio).toBe(0));
});

describe("live coaching hints", () => {
  it("nudges when no questions after two turns", () => {
    expect(liveHint([turn("seller", "This pen is great."), turn("buyer", "Meh."), turn("seller", "It's blue.")])).toMatch(/question/);
  });
  it("flags long answers", () => {
    expect(liveHint([turn("seller", "word ".repeat(80) + "?")])).toMatch(/long answer/);
  });
  it("stays quiet when things are going fine", () => {
    expect(liveHint([turn("seller", "When did you last sign something important?")])).toBeNull();
  });
});
