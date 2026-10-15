// Mock AI: deterministic buyer and coach for demo mode, local development, and tests. No API key, no cost.
import { analyze } from "../../shared/metrics";
import type { Report, Turn } from "../../shared/prompts";
import type { Difficulty, Scenario } from "../../shared/scenarios";

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true });
  });

export async function mockBuyerReply(s: Scenario, d: Difficulty, turns: Turn[], signal?: AbortSignal): Promise<string> {
  await delay(350, signal);
  const seller = turns.filter((t) => t.role === "seller");
  const last = seller.at(-1)?.text.toLowerCase() ?? "";
  const asked = seller.filter((t) => /\?|^(what|how|why|when|do you|are you)/i.test(t.text.trim())).length;
  const closing = /(buy|deal|sign|ready|start|book|commit|take it|want it|want one|move forward|let's do)/.test(last);
  const need = d === "easy" ? 0 : d === "medium" ? 1 : 2;
  const p = s.persona;
  if (closing && asked >= need && seller.length >= 2) return "Alright, you earned it. Let's do it. [DEAL]";
  if (closing && seller.length >= 6) return "No. You never figured out what I actually need. We're done here. [NO_DEAL]";
  if (asked > 0 && /\?/.test(last)) return `Fair question. Honestly, ${p.painPoints[seller.length % p.painPoints.length].replace(/^(his|her) /i, "my ").toLowerCase()}.`;
  return `${p.objections[seller.length % p.objections.length]} Why should I care?`;
}

export function mockReport(turns: Turn[], outcome: "deal" | "no_deal" | null): Report {
  const m = analyze(turns);
  const firstSeller = turns.findIndex((t) => t.role === "seller");
  const q = Math.min(100, 30 + m.questions * 15);
  const overall = Math.round((q + (outcome === "deal" ? 80 : 40) + Math.max(0, 90 - m.fillerCount * 10)) / 3);
  const quote = turns[firstSeller]?.text ?? "";
  return {
    overall_score: overall,
    summary: `Demo report: you asked ${m.questions} question${m.questions === 1 ? "" : "s"} and ${outcome === "deal" ? "closed the deal" : "did not close"}.`,
    outcome: outcome ?? "incomplete",
    top_strength: m.questions ? "You asked questions instead of only pitching." : "You kept the conversation going.",
    top_weakness: m.questions ? "Tie your offer more directly to the buyer's need." : "You pitched before asking any questions.",
    skills: [
      { name: "opening", score: 60, explanation: "Demo score." },
      { name: "discovery", score: q, explanation: `${m.questions} questions asked.` },
      { name: "questioning", score: Math.min(100, 40 + m.openQuestions * 20), explanation: `${m.openQuestions} open-ended.` },
      { name: "listening", score: 55, explanation: "Demo score." },
      { name: "empathy", score: null, explanation: "Did not come up." },
      { name: "value", score: 50, explanation: "Demo score." },
      { name: "objections", score: 50, explanation: "Demo score." },
      { name: "negotiation", score: null, explanation: "Did not come up." },
      { name: "closing", score: outcome === "deal" ? 80 : 35, explanation: outcome === "deal" ? "You asked for the sale." : "No clear close." },
      { name: "clarity", score: Math.max(20, 90 - m.fillerCount * 10), explanation: `${m.fillerCount} filler words.` },
      { name: "confidence", score: 60, explanation: "Demo score." },
      { name: "next_steps", score: outcome === "deal" ? 70 : 30, explanation: "Demo score." },
    ],
    top_improvements: ["Ask two questions before pitching", "Tie the product to their stated need", "Ask for the sale clearly"],
    key_moments: firstSeller >= 0 ? [{ turn: firstSeller + 1, kind: m.questions ? "strength" : "missed", quote, analysis: "Your opening line sets the tone for the call." }] : [],
    alternatives: firstSeller >= 0 ? [{ turn: firstSeller + 1, original: quote, problem: "Starts with the product, not the buyer.", better: "Before I do, when's the last time you needed one of these?", why: "Finds a need before pitching." }] : [],
    objections: [],
    compliance_flags: [],
    practice_plan: ["Run this scenario again and ask 3 questions first", "Practice a one-sentence value statement", "Practice 3 different closing questions"],
    next_objective: "Ask at least two discovery questions before you mention the product.",
  };
}

export function mockScenario(brief: string) {
  return {
    title: brief.slice(0, 60) || "Custom scenario",
    industry: "General", objective: "Find the buyer's need and agree a next step.",
    product: "Your product", opener: "Hi, I've only got a few minutes. What's this about?",
    winCondition: "The seller uncovers a real need and asks for a clear next step.",
    tips: ["Ask before you pitch", "Summarize their need", "Ask for a next step"],
    persona: {
      name: "Jordan Lee", title: "Manager", company: "Example Co", personality: "Busy and skeptical",
      style: "Short answers", painPoints: ["Too much manual work"], goals: ["Save time"], budget: "Small",
      timeline: "This quarter", hiddenMotivation: "Wants a promotion", objections: ["Too expensive", "Not now"],
    },
  };
}
