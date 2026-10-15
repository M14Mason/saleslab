// Sample history for demo mode, so every screen can be explored without an API key.
import { analyze } from "../../shared/metrics";
import type { Turn } from "../../shared/prompts";
import { SCENARIOS } from "../../shared/scenarios";
import { db, type Session } from "./db";
import { mockReport } from "./mock";

const SCRIPTS: Turn[][] = [
  [
    { role: "seller", text: "This pen is great, it writes really smooth and it's blue.", at: 4000 },
    { role: "buyer", text: "I've got a drawer full of pens, kid. Next.", at: 8000 },
    { role: "seller", text: "Um, it's only five dollars, like, super cheap.", at: 14000 },
    { role: "buyer", text: "You're boring me. We're done. [NO_DEAL]", at: 18000 },
  ],
  [
    { role: "seller", text: "Before I sell you anything, when did you last sign something important?", at: 3000 },
    { role: "buyer", text: "This morning. My good pen died mid-signature, actually.", at: 7000 },
    { role: "seller", text: "So you've got a contract at two and nothing reliable to sign it with?", at: 12000 },
    { role: "buyer", text: "Yeah. What's your point?", at: 15000 },
    { role: "seller", text: "This one won't skip. Fifteen bucks and you're covered for the signing. Want it?", at: 21000 },
    { role: "buyer", text: "Ha. Alright, you earned it. Deal. [DEAL]", at: 25000 },
  ],
];

/** Adds sample calls once per browser (won't come back after you remove them). */
export function seedDemo() {
  try { if (localStorage.getItem("saleslab.demoSeeded")) return; localStorage.setItem("saleslab.demoSeeded", "1"); } catch { /* ignore */ }
  if (db.sessions().some((s) => s.demo)) return;
  const now = Date.now();
  const make = (i: number, script: Turn[], daysAgo: number): Session => {
    const turns = script.map((t) => ({ ...t, text: t.text.replace(/\s*\[(NO_)?DEAL\]/, "") }));
    const outcome = script.at(-1)!.text.includes("[NO_DEAL]") ? "no_deal" : script.at(-1)!.text.includes("[DEAL]") ? "deal" : null;
    const started = new Date(now - daysAgo * 86400000);
    const report = mockReport(turns, outcome);
    return {
      id: `demo-${i}`, scenarioId: "wolf-pen", scenario: SCENARIOS[0], difficulty: i ? "medium" : "easy", mode: "practice",
      liveCoaching: true, surprise: false, timeLimitSec: null, status: "ended", outcome, turns,
      startedAt: started.toISOString(), endedAt: started.toISOString(), durationSec: Math.round(turns.at(-1)!.at / 1000) + 5,
      grading: { status: "completed", error: null, attempts: 1, ms: 9000 }, report, metrics: analyze(turns, 30),
      perf: { firstAudioMs: [1400], firstTokenMs: [700] }, demo: true,
    };
  };
  SCRIPTS.forEach((s, i) => db.upsertSession(make(i, s, 2 - i)));
}

export function removeDemo() {
  for (const s of db.sessions().filter((x) => x.demo)) db.deleteSession(s.id);
}
