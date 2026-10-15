import type { Report, Turn } from "../../shared/prompts";

export const sampleReport: Report = {
  overall_score: 42,
  summary: "Pitched features before asking anything.",
  outcome: "no_deal",
  top_strength: "Confident opener",
  top_weakness: "No discovery",
  skills: [{ name: "opening", score: 60, explanation: "ok" }, { name: "objections", score: null, explanation: "n/a" }],
  top_improvements: ["Ask first", "Tie to need", "Close"],
  key_moments: [{ turn: 1, kind: "weak", quote: "it writes smooth", analysis: "feature dump" }],
  alternatives: [{ turn: 1, original: "it writes smooth", problem: "features", better: "When did you last sign something?", why: "finds need" }],
  objections: [],
  compliance_flags: [],
  practice_plan: ["a", "b", "c"],
  next_objective: "Ask two questions before pitching.",
};

export const turn = (role: Turn["role"], text: string, at = 0): Turn => ({ role, text, at });

/** Builds an Anthropic SSE stream body from text chunks. */
export function sse(chunks: string[], stop = "end_turn"): string {
  const ev = (o: unknown) => `event: x\ndata: ${JSON.stringify(o)}\n\n`;
  return [
    ev({ type: "message_start", message: {} }),
    ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    ...chunks.map((c) => ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: c } })),
    ev({ type: "content_block_stop", index: 0 }),
    ev({ type: "message_delta", delta: { stop_reason: stop } }),
    ev({ type: "message_stop" }),
  ].join("");
}

/** A response that contains only a (hidden) thinking block, like Haiku 5.5 with thinking on. */
export function sseThinkingOnly(): string {
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  return [
    ev({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
    ev({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "" } }),
    ev({ type: "message_delta", delta: { stop_reason: "max_tokens" } }),
  ].join("");
}

export function streamResponse(body: string, status = 200): Response {
  const enc = new TextEncoder();
  // Deliver in small pieces so the parser must handle events split across reads.
  const parts = body.match(/[\s\S]{1,37}/g) ?? [];
  return new Response(new ReadableStream({
    start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); },
  }), { status, headers: { "content-type": "text/event-stream" } });
}
