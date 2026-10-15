// Progress, streaks, achievements, recommendations. Pure functions over stored sessions.
import { db, type Session } from "./db";
import { SKILLS, type Skill } from "../../shared/prompts";
import { dailyScenario, SCENARIOS, type Category, type Scenario } from "../../shared/scenarios";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function streak(sessions: Session[], today = new Date()): number {
  const days = new Set(sessions.filter((s) => s.status === "ended").map((s) => dayKey(new Date(s.startedAt))));
  let n = 0;
  const d = new Date(today);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // streak still alive if you practiced yesterday
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const graded = (sessions: Session[]) => sessions.filter((s) => s.report);

export function skillAverages(sessions: Session[], last = 10): Record<Skill, number | null> {
  const recent = graded(sessions).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, last);
  const out = {} as Record<Skill, number | null>;
  for (const k of SKILLS) {
    const vals = recent.map((s) => s.report!.skills.find((x) => x.name === k)?.score).filter((v): v is number => typeof v === "number");
    out[k] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }
  return out;
}

const SKILL_TO_CATEGORY: Record<Skill, Category> = {
  opening: "cold-call", discovery: "discovery", questioning: "discovery", listening: "discovery",
  empathy: "objections", value: "demo", objections: "objections", negotiation: "negotiation",
  closing: "closing", clarity: "executive", confidence: "pen", next_steps: "closing",
};

/** Suggests a scenario that trains your weakest skill. */
export function recommend(sessions: Session[]): { scenario: Scenario; skill: Skill | null; reason: string } {
  const avg = skillAverages(sessions);
  const scored = SKILLS.filter((k) => avg[k] !== null).sort((a, b) => avg[a]! - avg[b]!);
  const weakest = scored[0] ?? null;
  if (!weakest) return { scenario: SCENARIOS[0], skill: null, reason: "Start with the classic." };
  const cat = SKILL_TO_CATEGORY[weakest];
  const done = new Set(sessions.map((s) => s.scenarioId));
  const pool = SCENARIOS.filter((s) => s.category === cat);
  const scenario = pool.find((s) => !done.has(s.id)) ?? pool[0] ?? SCENARIOS[0];
  return { scenario, skill: weakest, reason: `Your weakest skill lately is ${weakest.replace("_", " ")} (${avg[weakest]}).` };
}

export function level(sessions: Session[]): { name: string; xp: number; next: number | null; progress: number } {
  const xp = graded(sessions).reduce((a, s) => a + Math.max(10, s.report!.overall_score), 0);
  const tiers: [string, number][] = [["Rookie", 0], ["Rep", 300], ["Closer", 900], ["Shark", 2000], ["Wolf", 4000]];
  let i = 0;
  while (i + 1 < tiers.length && xp >= tiers[i + 1][1]) i++;
  const next = tiers[i + 1]?.[1] ?? null;
  const progress = next ? (xp - tiers[i][1]) / (next - tiers[i][1]) : 1;
  return { name: tiers[i][0], xp, next, progress };
}

export function weekly(sessions: Session[], now = new Date()) {
  const start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
  const week = sessions.filter((s) => s.status === "ended" && new Date(s.startedAt) >= start);
  const scored = week.filter((s) => s.report);
  return {
    calls: week.length,
    minutes: Math.round(week.reduce((a, s) => a + s.durationSec, 0) / 60),
    avg: scored.length ? Math.round(scored.reduce((a, s) => a + s.report!.overall_score, 0) / scored.length) : null,
    deals: week.filter((s) => s.outcome === "deal").length,
  };
}

export function dailyChallengeDone(sessions: Session[], now = new Date()) {
  const { scenario } = dailyScenario(now);
  return sessions.some((s) => s.scenarioId === scenario.id && s.status === "ended" && dayKey(new Date(s.startedAt)) === dayKey(now));
}

export type Achievement = { id: string; title: string; desc: string; test: (s: Session[]) => boolean };

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-call", title: "First call", desc: "Finish your first call.", test: (s) => s.some((x) => x.status === "ended") },
  { id: "first-deal", title: "Closer", desc: "Win your first deal.", test: (s) => s.some((x) => x.outcome === "deal") },
  { id: "wolf-hard", title: "Tamed the Wolf", desc: "Close the pen challenge on Hard.", test: (s) => s.some((x) => x.scenarioId === "wolf-pen" && x.difficulty === "hard" && x.outcome === "deal") },
  { id: "score-80", title: "Pro level", desc: "Score 80 or higher.", test: (s) => graded(s).some((x) => x.report!.overall_score >= 80) },
  { id: "score-90", title: "Elite", desc: "Score 90 or higher.", test: (s) => graded(s).some((x) => x.report!.overall_score >= 90) },
  { id: "streak-3", title: "On a roll", desc: "Practice 3 days in a row.", test: (s) => streak(s) >= 3 },
  { id: "streak-7", title: "Habit formed", desc: "Practice 7 days in a row.", test: (s) => streak(s) >= 7 },
  { id: "explorer", title: "Explorer", desc: "Try 5 different scenarios.", test: (s) => new Set(s.filter((x) => x.status === "ended").map((x) => x.scenarioId)).size >= 5 },
  { id: "curious", title: "Curious", desc: "Ask 5+ questions in one call.", test: (s) => s.some((x) => (x.metrics?.questions ?? 0) >= 5) },
  { id: "clean-talker", title: "Clean talker", desc: "Zero filler words in a call with 5+ turns.", test: (s) => s.some((x) => x.metrics && x.metrics.sellerTurns >= 5 && x.metrics.fillerCount === 0) },
  { id: "ten-calls", title: "Ten calls", desc: "Finish 10 calls.", test: (s) => s.filter((x) => x.status === "ended").length >= 10 },
  { id: "assessment", title: "Under pressure", desc: "Complete an assessment-mode call.", test: (s) => graded(s).some((x) => x.mode === "assessment") },
];

/** Unlocks newly earned achievements. Returns the ones unlocked by this call. */
export function evaluateAchievements(): Achievement[] {
  const d = db.get();
  const fresh = ACHIEVEMENTS.filter((a) => !d.achievements[a.id] && a.test(d.sessions));
  if (fresh.length) db.unlock(fresh.map((a) => a.id));
  return fresh;
}
