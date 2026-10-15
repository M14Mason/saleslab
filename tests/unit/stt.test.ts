import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Listener, type SttError } from "../../src/speech/stt";

// A controllable fake of the browser's SpeechRecognition.
class FakeRec {
  static last: FakeRec | null = null;
  static count = 0;
  lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  results: { t: string; final: boolean }[] = [];
  constructor() { FakeRec.last = this; FakeRec.count++; }
  start() {}
  stop() { this.onend?.(); }
  abort() {}
  say(t: string, final = false) {
    this.results.push({ t, final });
    const list = this.results.map((r) => Object.assign([{ transcript: r.t }], { isFinal: r.final }));
    this.onresult?.({ resultIndex: 0, results: list });
  }
  /** Replace the last (interim) result, like the browser refining a guess. */
  refine(t: string, final = false) { this.results.pop(); this.say(t, final); }
}

let onFinal: ReturnType<typeof vi.fn<(t: string) => void>>, onError: ReturnType<typeof vi.fn<(c: SttError) => void>>, onInterim: ReturnType<typeof vi.fn<(t: string) => void>>;
const make = (pauseMs = 1600) => new Listener({ pauseMs, onFinal, onError, onInterim });

beforeEach(() => {
  vi.useFakeTimers();
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRec;
  FakeRec.count = 0;
  onFinal = vi.fn<(t: string) => void>(); onError = vi.fn<(c: SttError) => void>(); onInterim = vi.fn<(t: string) => void>();
});
afterEach(() => vi.useRealTimers());

describe("turn-taking (regression: AI cut the user off)", () => {
  it("uses continuous recognition with interim results", () => {
    make().start();
    expect(FakeRec.last!.continuous).toBe(true);
    expect(FakeRec.last!.interimResults).toBe(true);
  });

  it("does not end the turn during a natural pause shorter than pauseMs", () => {
    const l = make(1600); l.start();
    FakeRec.last!.say("So before I sell you anything.", true);
    vi.advanceTimersByTime(1200);           // thinking pause
    FakeRec.last!.say("When did you last sign something?", true);
    vi.advanceTimersByTime(1200);
    expect(onFinal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onFinal).toHaveBeenCalledWith("So before I sell you anything. When did you last sign something?");
  });

  it("waits longer when the last words are still interim mid-sentence", () => {
    const l = make(1000); l.start();
    FakeRec.last!.say("I was going to say that");
    vi.advanceTimersByTime(1100);
    expect(onFinal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onFinal).toHaveBeenCalledOnce();
  });

  it("keeps words and keeps listening when the browser ends recognition by itself", () => {
    const l = make(); l.start();
    FakeRec.last!.say("first part", true);
    FakeRec.last!.onend!();                 // Chrome auto-stop
    expect(FakeRec.count).toBe(2);          // restarted
    FakeRec.last!.say("second part", true);
    l.finish();
    expect(onFinal).toHaveBeenCalledWith("first part second part");
  });

  it("Send finishes immediately; Re-record discards", () => {
    const a = make(); a.start(); FakeRec.last!.say("hello there", true); a.finish();
    expect(onFinal).toHaveBeenCalledWith("hello there");
    const b = make(); b.start(); FakeRec.last!.say("oops", true); b.cancel();
    vi.advanceTimersByTime(5000);
    expect(onFinal).toHaveBeenCalledTimes(1);
  });

  it("reports no-speech after the timeout and blocked mics right away", () => {
    const a = new Listener({ pauseMs: 1000, noSpeechMs: 3000, onFinal, onError, onInterim }); a.start();
    vi.advanceTimersByTime(3100);
    expect(onError).toHaveBeenCalledWith("no-speech");
    const b = make(); b.start(); FakeRec.last!.onerror!({ error: "not-allowed" });
    expect(onError).toHaveBeenLastCalledWith("denied");
  });

  it("emits interim text for live captions", () => {
    const l = make(); l.start();
    FakeRec.last!.say("when did");
    FakeRec.last!.refine("when did you last");
    expect(onInterim).toHaveBeenLastCalledWith("when did you last");
  });
});
