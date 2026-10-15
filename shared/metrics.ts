// Deterministic transcript analytics. Computed locally: instant, free, and testable.
import type { Turn } from "./prompts";

const FILLERS = ["um", "uh", "erm", "like", "you know", "basically", "actually", "literally", "kind of", "sort of", "i mean", "so yeah"];
const OPEN_STARTS = /^(what|how|why|tell me|walk me|describe|explain|help me understand|in what way)/i;
const CLOSED_STARTS = /^(do|does|did|is|are|was|were|can|could|would|will|have|has|should)\b/i;

export type Metrics = {
  sellerWords: number;
  buyerWords: number;
  talkRatio: number;           // seller share of words, 0-100
  questions: number;
  openQuestions: number;
  fillerCount: number;
  fillers: Record<string, number>;
  longestTurnWords: number;
  avgTurnWords: number;
  sellerTurns: number;
  durationSec: number;
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function countFillers(text: string): Record<string, number> {
  const t = ` ${text.toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ")} `;
  const out: Record<string, number> = {};
  const words = t.trim().split(" ");
  for (const f of FILLERS) {
    let n: number;
    if (f === "like") {
      // "like" is a filler unless it's a verb ("I like it", "would like") or a comparison ("looks like").
      const VERB_BEFORE = new Set(["i", "you", "we", "they", "he", "she", "would", "dont", "don't", "do", "does", "really", "also", "might", "looks", "look", "feels", "sounds", "seems", "just"]);
      n = words.filter((w, i) => w === "like" && !VERB_BEFORE.has(words[i - 1] ?? "")).length;
    } else n = (t.match(new RegExp(` ${f} `, "g")) || []).length;
    if (n) out[f] = n;
  }
  return out;
}

/** Speech transcripts often drop "?", so question-shaped openings count too. */
export function splitQuestions(text: string): string[] {
  return text
    .split(/(?<=[?.!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith("?") || OPEN_STARTS.test(s) || (CLOSED_STARTS.test(s) && /^\w+ (you|we|your|i|it|that|this|there|they)\b/i.test(s)));
}

export function analyze(turns: Turn[], durationSec = 0): Metrics {
  const seller = turns.filter((t) => t.role === "seller");
  const buyer = turns.filter((t) => t.role === "buyer");
  const sellerWords = seller.reduce((a, t) => a + words(t.text), 0);
  const buyerWords = buyer.reduce((a, t) => a + words(t.text), 0);
  const fillers: Record<string, number> = {};
  let questions = 0, openQuestions = 0, longest = 0;
  for (const t of seller) {
    for (const [k, v] of Object.entries(countFillers(t.text))) fillers[k] = (fillers[k] ?? 0) + v;
    const qs = splitQuestions(t.text);
    questions += qs.length;
    openQuestions += qs.filter((q) => OPEN_STARTS.test(q)).length;
    longest = Math.max(longest, words(t.text));
  }
  const total = sellerWords + buyerWords;
  return {
    sellerWords, buyerWords,
    talkRatio: total ? Math.round((sellerWords / total) * 100) : 0,
    questions, openQuestions,
    fillerCount: Object.values(fillers).reduce((a, b) => a + b, 0),
    fillers, longestTurnWords: longest,
    avgTurnWords: seller.length ? Math.round(sellerWords / seller.length) : 0,
    sellerTurns: seller.length, durationSec,
  };
}

/** Live coaching nudge after each seller turn. Returns null when there's nothing useful to say. */
export function liveHint(turns: Turn[]): string | null {
  const seller = turns.filter((t) => t.role === "seller");
  const last = seller.at(-1);
  if (!last) return null;
  const m = analyze(turns);
  const lastWords = words(last.text);
  if (seller.length >= 2 && m.questions === 0) return "You haven't asked a question yet. Find their need before pitching.";
  if (lastWords > 70) return "That was a long answer. Try 2-3 sentences, then ask a question.";
  const lastFillers = Object.values(countFillers(last.text)).reduce((a, b) => a + b, 0);
  if (lastFillers >= 3) return "Lots of filler words. Pause instead of saying 'um'.";
  if (seller.length >= 4 && m.talkRatio > 70) return `You're talking ${m.talkRatio}% of the time. Ask more, listen more.`;
  if (seller.length >= 5 && !/(\?|would you|can we|shall we|ready to|let's)/i.test(seller.slice(-3).map((t) => t.text).join(" ")))
    return "Have you asked for a next step or the close yet?";
  return null;
}
