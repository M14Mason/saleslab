import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buyerTurn, ClaudeError, CONFIG, gradeSession, setKey } from "../../src/lib/claude";
import { SCENARIOS } from "../../shared/scenarios";
import { sampleReport, sse, sseThinkingOnly, streamResponse, turn } from "./fixtures";

const scenario = SCENARIOS[0];
const turns = [turn("seller", "This pen is great.")];
let fetchMock: ReturnType<typeof vi.fn>;
const bodyOf = (i = 0) => JSON.parse(fetchMock.mock.calls[i][1].body);

beforeEach(() => {
  setKey("sk-ant-test");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("buyer turn request (regression: 'Talk to me.' loop and slow replies)", () => {
  it("disables thinking, streams, and leaves room for the reply", async () => {
    fetchMock.mockResolvedValueOnce(streamResponse(sse(["Why would ", "I need a pen?"])));
    await buyerTurn({ scenario, difficulty: "medium", turns });
    const b = bodyOf();
    // Default "smart" buyer: Sonnet 5.5, which rejects "disabled" and takes "between_tools" (= no thinking without tools).
    expect(b.thinking).toEqual({ type: "between_tools" });
    expect(b.model).toBe(CONFIG.buyer.model);
    expect(b.system).toMatch(/Call memory/);
    expect(b.stream).toBe(true);
    expect(b.max_tokens).toBeGreaterThanOrEqual(300);
    expect(b.output_config.effort).toBe("low");
    expect(b.temperature).toBeUndefined(); // non-default temperature is rejected by current models
    expect(fetchMock.mock.calls[0][1].headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("fast mode uses Haiku with thinking disabled", async () => {
    fetchMock.mockResolvedValueOnce(streamResponse(sse(["Sure."])));
    await buyerTurn({ scenario, difficulty: "medium", turns, brain: "fast" });
    expect(bodyOf().thinking).toEqual({ type: "disabled" });
    expect(bodyOf().model).toBe(CONFIG.buyer.fastModel);
  });

  it("a reply that stalls mid-stream times out instead of hanging the call (round 3)", async () => {
    vi.useFakeTimers();
    const enc = new TextEncoder();
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({
      start(c) { c.enqueue(enc.encode(sse(["Hold on"]).split("event: x\ndata: {\"type\":\"content_block_stop")[0])); /* never closes */ },
    }), { status: 200 }));
    const p = buyerTurn({ scenario, difficulty: "easy", turns }).catch((x) => x);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(await p).toMatchObject({ kind: "timeout" });
    vi.useRealTimers();
  });

  it("streams deltas in order and returns the parsed reply", async () => {
    fetchMock.mockResolvedValueOnce(streamResponse(sse(["Fine, ", "sold. [DEAL]"])));
    const seen: string[] = [];
    const r = await buyerTurn({ scenario, difficulty: "easy", turns, onText: (d) => seen.push(d) });
    expect(seen.join("")).toBe("Fine, sold. [DEAL]");
    expect(r).toMatchObject({ reply: "Fine, sold.", outcome: "deal" });
  });

  it("never invents a canned line when the model returns no text", async () => {
    fetchMock.mockResolvedValueOnce(streamResponse(sseThinkingOnly())).mockResolvedValueOnce(streamResponse(sseThinkingOnly()));
    await expect(buyerTurn({ scenario, difficulty: "medium", turns })).rejects.toMatchObject({ kind: "invalid_output" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // one controlled retry, then a clear error
  });

  it("regenerates once when the buyer repeats an earlier line, discarding what was streamed", async () => {
    const history = [turn("seller", "hi"), turn("buyer", "Talk to me."), turn("seller", "ok")];
    fetchMock.mockResolvedValueOnce(streamResponse(sse(["Talk to me."]))).mockResolvedValueOnce(streamResponse(sse(["What do you want, kid?"])));
    const onDiscard = vi.fn();
    const r = await buyerTurn({ scenario, difficulty: "medium", turns: history, onDiscard });
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(r.reply).toBe("What do you want, kid?");
    expect(bodyOf(1).system).toMatch(/repeated an earlier line/);
  });

  it("maps HTTP errors to clear, typed errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }));
    await expect(buyerTurn({ scenario, difficulty: "easy", turns })).rejects.toMatchObject({ kind: "auth" });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    await expect(buyerTurn({ scenario, difficulty: "easy", turns })).rejects.toMatchObject({ kind: "rate" });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 529 }));
    const e = await buyerTurn({ scenario, difficulty: "easy", turns }).catch((x) => x);
    expect(e).toBeInstanceOf(ClaudeError);
    expect(e.retryable).toBe(true);
  });

  it("reports network failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(buyerTurn({ scenario, difficulty: "easy", turns })).rejects.toMatchObject({ kind: "network" });
  });

  it("times out a hung request instead of freezing", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => new Promise((_, rej) => {
      init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    }));
    const p = buyerTurn({ scenario, difficulty: "easy", turns }).catch((x) => x);
    await vi.advanceTimersByTimeAsync(CONFIG.buyer.timeoutMs + 10);
    expect(await p).toMatchObject({ kind: "timeout" });
    vi.useRealTimers();
  });

  it("can be cancelled (barge-in / end call)", async () => {
    const ctrl = new AbortController();
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => new Promise((_, rej) => {
      init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    }));
    const p = buyerTurn({ scenario, difficulty: "easy", turns, signal: ctrl.signal }).catch((x) => x);
    ctrl.abort();
    expect(await p).toMatchObject({ kind: "aborted" });
  });
});

describe("grading request (regression: grading never generated)", () => {
  const args = { scenario, difficulty: "medium" as const, mode: "practice" as const, turns: [turn("seller", "it writes smooth"), turn("buyer", "No. [NO_DEAL]")], outcome: "no_deal" as const, pastWeaknesses: [] };

  it("uses structured outputs, not forced tool_choice (which Sonnet 5.5 rejects)", async () => {
    fetchMock.mockResolvedValueOnce(streamResponse(sse([JSON.stringify(sampleReport)])));
    const stages: string[] = [];
    const r = await gradeSession({ ...args, onStage: (s) => stages.push(s) });
    const b = bodyOf();
    expect(b.tool_choice).toBeUndefined();
    expect(b.tools).toBeUndefined();
    expect(b.output_config.format.type).toBe("json_schema");
    expect(b.model).toBe(CONFIG.grader.model);
    expect(b.max_tokens).toBeGreaterThanOrEqual(8000); // thinking counts toward max_tokens
    expect(b.messages[0].content).toContain("[1] SELLER: it writes smooth");
    expect(r.overall_score).toBe(42);
    expect(stages).toEqual(["analyzing", "scoring"]);
  });

  it("rejects unreadable JSON and truncated reports", async () => {
    fetchMock.mockResolvedValueOnce(streamResponse(sse(["{not json"])));
    await expect(gradeSession(args)).rejects.toMatchObject({ kind: "invalid_output" });
    fetchMock.mockResolvedValueOnce(streamResponse(sse(['{"overall_score": 4'], "max_tokens")));
    await expect(gradeSession(args)).rejects.toThrow(/cut off/);
    fetchMock.mockResolvedValueOnce(streamResponse(sse([JSON.stringify({ overall_score: 50 })])));
    await expect(gradeSession(args)).rejects.toThrow(/incomplete/);
  });
});
