// Direct browser -> Anthropic client. Streaming, timeouts, cancellation, typed errors, mock mode.
import { z } from "zod";
import {
  buildGraderPrompt, buyerSystemPrompt, GeneratedScenarioSchema, GRADER_SYSTEM, isRepeat, parseOutcome,
  REPORT_JSON_SCHEMA, ReportSchema, SCENARIO_JSON_SCHEMA, sanitizeReport, toClaudeMessages,
  type Report, type Turn,
} from "../../shared/prompts";
import type { Difficulty, Scenario } from "../../shared/scenarios";
import { mockBuyerReply, mockReport, mockScenario } from "./mock";
import { log } from "./log";

export const CONFIG = {
  buyer: { model: "claude-haiku-5-5", maxTokens: 400, effort: "low", timeoutMs: 25_000 },
  grader: { model: "claude-sonnet-5-5", maxTokens: 16_000, effort: "medium", timeoutMs: 120_000 },
  generator: { model: "claude-haiku-5-5", maxTokens: 2_000, effort: "low", timeoutMs: 40_000 },
};

export type ErrKind = "auth" | "rate" | "overloaded" | "network" | "timeout" | "aborted" | "bad_request" | "server" | "invalid_output";
export class ClaudeError extends Error {
  constructor(public kind: ErrKind, message: string) { super(message); }
  get retryable() { return ["rate", "overloaded", "network", "timeout", "server", "invalid_output"].includes(this.kind); }
}

import { getKey, isMock } from "./keys";
export { getKey, setKey, isMock } from "./keys";

function mapStatus(status: number, msg?: string): ClaudeError {
  if (status === 401 || status === 403) return new ClaudeError("auth", "Claude rejected your API key. Update it in Settings.");
  if (status === 429) return new ClaudeError("rate", "Rate limited by Claude. Wait a few seconds and retry.");
  if (status === 529) return new ClaudeError("overloaded", "Claude is overloaded right now. Retry in a moment.");
  if (status === 400) return new ClaudeError("bad_request", msg || "Claude rejected the request.");
  return new ClaudeError("server", msg || `Claude error (${status}).`);
}

async function post(body: Record<string, unknown>, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
  const key = getKey();
  if (!key) throw new ClaudeError("auth", "Add your Claude API key in Settings.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  const onAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw mapStatus(res.status, j?.error?.message);
    }
    return res;
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    if (signal?.aborted) throw new ClaudeError("aborted", "Cancelled.");
    if (ctrl.signal.aborted) throw new ClaudeError("timeout", "Claude took too long to respond. Retry.");
    throw new ClaudeError("network", "No connection to Claude. Check your internet.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Reads an SSE stream, calling onText for each text delta. Returns full text + stop reason. */
async function readStream(res: Response, onText: (t: string) => void, signal?: AbortSignal): Promise<{ text: string; stop: string | null }> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", stop: string | null = null;
  try {
    for (;;) {
      if (signal?.aborted) throw new ClaudeError("aborted", "Cancelled.");
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = chunk.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim();
        if (!data) continue;
        let ev: { type: string; delta?: { type?: string; text?: string; stop_reason?: string }; error?: { type?: string; message?: string } };
        try { ev = JSON.parse(data); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) { text += ev.delta.text; onText(ev.delta.text); }
        else if (ev.type === "message_delta" && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
        else if (ev.type === "error") throw ev.error?.type === "overloaded_error" ? mapStatus(529) : new ClaudeError("server", ev.error?.message || "Stream error");
      }
    }
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    throw new ClaudeError(signal?.aborted ? "aborted" : "network", signal?.aborted ? "Cancelled." : "Connection dropped mid-reply. Retry.");
  } finally {
    reader.releaseLock();
  }
  return { text, stop };
}

export type BuyerResult = { reply: string; outcome: "deal" | "no_deal" | null; firstTokenMs: number; totalMs: number };

/**
 * One buyer turn. Streams text to onText as it arrives (for early speech).
 * Guards: never returns empty text or a verbatim repeat; regenerates once, then fails loudly.
 */
export async function buyerTurn(args: {
  scenario: Scenario; difficulty: Difficulty; turns: Turn[]; surprise?: boolean;
  onText?: (delta: string) => void;
  /** Called when streamed text must be thrown away (empty/repeated draft); stop speaking it. */
  onDiscard?: () => void;
  signal?: AbortSignal;
}): Promise<BuyerResult> {
  const t0 = performance.now();
  if (isMock()) {
    const reply = await mockBuyerReply(args.scenario, args.difficulty, args.turns, args.signal);
    args.onText?.(reply);
    const p = parseOutcome(reply);
    return { reply: p.text, outcome: p.outcome, firstTokenMs: performance.now() - t0, totalMs: performance.now() - t0 };
  }
  const cfg = CONFIG.buyer;
  for (let attempt = 0; attempt < 2; attempt++) {
    let first = 0;
    const nudge = attempt > 0 ? "\n\nYour previous draft repeated an earlier line or was empty. Say something new that moves the conversation forward." : "";
    const res = await post({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      stream: true,
      // Root cause of the old "Talk to me." loop: Haiku 5.5 thinks by default and thinking
      // consumed the whole token budget, leaving no text. Roleplay needs speed, not deliberation.
      thinking: { type: "disabled" },
      output_config: { effort: cfg.effort },
      system: buyerSystemPrompt(args.scenario, args.difficulty, { surprise: args.surprise }) + nudge,
      messages: toClaudeMessages(args.turns),
    }, args.signal, cfg.timeoutMs);
    const { text } = await readStream(res, (d) => { if (!first) first = performance.now() - t0; args.onText?.(d); }, args.signal);
    const p = parseOutcome(text);
    if (p.text && !isRepeat(p.text, args.turns)) {
      log("buyer_turn", { firstTokenMs: Math.round(first), totalMs: Math.round(performance.now() - t0), attempt });
      return { reply: p.text, outcome: p.outcome, firstTokenMs: first, totalMs: performance.now() - t0 };
    }
    log("buyer_repeat_or_empty", { attempt });
    args.onDiscard?.();
  }
  throw new ClaudeError("invalid_output", "The buyer didn't answer properly. Tap Retry.");
}

export async function gradeSession(args: {
  scenario: Scenario; difficulty: Difficulty; mode: "practice" | "assessment"; turns: Turn[];
  outcome: "deal" | "no_deal" | null; pastWeaknesses: string[]; signal?: AbortSignal;
  onStage?: (s: "analyzing" | "scoring") => void;
}): Promise<Report> {
  if (isMock()) { args.onStage?.("analyzing"); await sleep(400, args.signal); args.onStage?.("scoring"); return mockReport(args.turns, args.outcome); }
  const cfg = CONFIG.grader;
  args.onStage?.("analyzing");
  const res = await post({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    stream: true,
    // Root cause of grading failing: Sonnet 5.5 rejects forced tool_choice (400 on every call).
    // Structured outputs give schema-valid JSON without forcing a tool.
    output_config: { effort: cfg.effort, format: { type: "json_schema", schema: REPORT_JSON_SCHEMA } },
    system: GRADER_SYSTEM,
    messages: [{ role: "user", content: buildGraderPrompt(args) }],
  }, args.signal, cfg.timeoutMs);
  let started = false;
  const { text, stop } = await readStream(res, () => { if (!started) { started = true; args.onStage?.("scoring"); } }, args.signal);
  if (stop === "max_tokens") throw new ClaudeError("invalid_output", "The report was cut off. Retry.");
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new ClaudeError("invalid_output", "The coach returned an unreadable report. Retry."); }
  const valid = ReportSchema.safeParse(json);
  if (!valid.success) { log("grade_invalid", { issues: valid.error.issues.length }); throw new ClaudeError("invalid_output", "The coach's report was incomplete. Retry."); }
  return sanitizeReport(valid.data, args.turns.length);
}

export async function generateScenario(brief: string, signal?: AbortSignal): Promise<z.infer<typeof GeneratedScenarioSchema>> {
  if (isMock()) return mockScenario(brief);
  const cfg = CONFIG.generator;
  const res = await post({
    model: cfg.model, max_tokens: cfg.maxTokens, thinking: { type: "disabled" },
    output_config: { effort: cfg.effort, format: { type: "json_schema", schema: SCENARIO_JSON_SCHEMA } },
    system: "You design realistic sales-training roleplay scenarios. Create an ORIGINAL fictional buyer (never a real person or real company). Keep every field short. 3 tips, 3-4 objections, 2-3 pain points. The opener is the first thing the buyer says on the call.",
    messages: [{ role: "user", content: `Create a scenario for this practice goal: ${brief.slice(0, 500)}` }],
  }, signal, cfg.timeoutMs);
  const j = await res.json();
  const text = (j.content as { type: string; text?: string }[]).find((b) => b.type === "text")?.text ?? "";
  try {
    return GeneratedScenarioSchema.parse(JSON.parse(text));
  } catch {
    throw new ClaudeError("invalid_output", "Couldn't generate a usable scenario. Try rephrasing.");
  }
}

/** Cheap key check: a 1-token request. */
export async function testKey(): Promise<void> {
  if (isMock()) return;
  const res = await post({ model: CONFIG.buyer.model, max_tokens: 5, thinking: { type: "disabled" }, messages: [{ role: "user", content: "Hi" }] }, undefined, 15_000);
  await res.json();
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new ClaudeError("aborted", "Cancelled.")); }, { once: true });
  });
}
