import type { SessionRow } from "./api";

export function summarize(rows: SessionRow[]) {
  const scored = rows.filter((r) => r.score != null);
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score!, 0) / scored.length) : null;
  const minutes = Math.round(rows.reduce((a, r) => a + (r.duration_sec ?? 0), 0) / 60);
  const deals = rows.filter((r) => r.outcome === "deal").length;
  const byLevel = (["easy", "medium", "hard"] as const).map((d) => {
    const s = scored.filter((r) => r.difficulty === d);
    return { difficulty: d, count: s.length, avg: s.length ? Math.round(s.reduce((a, r) => a + r.score!, 0) / s.length) : null };
  });
  // Trend: oldest to newest scores
  const trend = [...scored].sort((a, b) => a.started_at.localeCompare(b.started_at)).map((r) => r.score!);
  const recent = trend.slice(-5), prior = trend.slice(-10, -5);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const change = recent.length && prior.length ? Math.round(mean(recent) - mean(prior)) : null;
  return { sessions: rows.length, avg, minutes, deals, byLevel, trend, change };
}
