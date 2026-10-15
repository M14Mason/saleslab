import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setKey } from "../../src/lib/claude";
import { db, type Session } from "../../src/lib/db";
import { isGrading, startGrading } from "../../src/lib/grading";
import { SCENARIOS } from "../../shared/scenarios";
import { sampleReport, sse, streamResponse, turn } from "./fixtures";

let fetchMock: ReturnType<typeof vi.fn>;

function session(over: Partial<Session> = {}): Session {
  return {
    id: "s1", scenarioId: "wolf-pen", scenario: SCENARIOS[0], difficulty: "medium", mode: "practice", liveCoaching: true,
    surprise: false, timeLimitSec: null, status: "ended", outcome: "no_deal",
    turns: [turn("seller", "it writes smooth"), turn("buyer", "No.")], startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
    durationSec: 30, grading: { status: "idle", error: null, attempts: 0, ms: null }, report: null, metrics: null,
    perf: { firstAudioMs: [], firstTokenMs: [] }, ...over,
  };
}

beforeEach(() => {
  setKey("sk-ant-test");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("grading pipeline", () => {
  it("runs exactly once even if triggered twice at the same time", async () => {
    db.upsertSession(session());
    fetchMock.mockResolvedValue(streamResponse(sse([JSON.stringify(sampleReport)])));
    const a = startGrading("s1"), b = startGrading("s1");
    expect(a).toBe(b);
    expect(isGrading("s1")).toBe(true);
    await a;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const s = db.session("s1")!;
    expect(s.report?.overall_score).toBe(42);
    expect(s.grading.status).toBe("completed");
    expect(s.metrics?.sellerTurns).toBe(1);
    expect(isGrading("s1")).toBe(false);
  });

  it("does not regrade a session that already has a report (no double charge)", async () => {
    db.upsertSession(session({ report: sampleReport }));
    await startGrading("s1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("auto-retries once on a transient error, then succeeds", async () => {
    vi.useFakeTimers();
    db.upsertSession(session());
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 529 })).mockResolvedValueOnce(streamResponse(sse([JSON.stringify(sampleReport)])));
    const p = startGrading("s1");
    await vi.advanceTimersByTimeAsync(3000);
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(db.session("s1")!.grading.status).toBe("completed");
  });

  it("fails with a useful message after the retry, and manual retry works", async () => {
    vi.useFakeTimers();
    db.upsertSession(session());
    fetchMock.mockResolvedValue(new Response("{}", { status: 529 }));
    const p = startGrading("s1");
    await vi.advanceTimersByTimeAsync(3000);
    await p;
    let s = db.session("s1")!;
    expect(s.grading.status).toBe("failed");
    expect(s.grading.error).toMatch(/overloaded/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset().mockResolvedValueOnce(streamResponse(sse([JSON.stringify(sampleReport)])));
    await startGrading("s1", { force: true });
    s = db.session("s1")!;
    expect(s.grading.status).toBe("completed");
    expect(s.grading.attempts).toBe(2);
  });

  it("does not auto-retry a bad API key", async () => {
    db.upsertSession(session());
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await startGrading("s1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.session("s1")!.grading.error).toMatch(/API key/);
  });

  it("refuses to grade an empty call", async () => {
    db.upsertSession(session({ turns: [] }));
    await startGrading("s1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.session("s1")!.grading.error).toMatch(/Nothing to grade/);
  });

  it("unlocks achievements after grading", async () => {
    db.upsertSession(session());
    fetchMock.mockResolvedValue(streamResponse(sse([JSON.stringify(sampleReport)])));
    await startGrading("s1");
    expect(db.get().achievements["first-call"]).toBeTruthy();
  });
});
