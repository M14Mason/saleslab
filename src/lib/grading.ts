// Grading runs exactly once per session: single-flight, persisted, idempotent, with one controlled auto-retry.
import { ClaudeError, gradeSession, sleep } from "./claude";
import { db } from "./db";
import { log } from "./log";
import { analyze } from "../../shared/metrics";
import { evaluateAchievements } from "./progress";

const running = new Map<string, Promise<void>>();
export const isGrading = (id: string) => running.has(id);

export function startGrading(id: string, opts: { force?: boolean } = {}): Promise<void> {
  const existing = running.get(id);
  if (existing) return existing;                 // duplicate click / StrictMode double effect
  const s = db.session(id);
  if (!s) return Promise.resolve();
  if (s.report && !opts.force) return Promise.resolve();
  if (!s.turns.some((t) => t.role === "seller")) {
    db.patchSession(id, (x) => { x.grading = { ...x.grading, status: "failed", error: "Nothing to grade. Say something on the call first." }; });
    return Promise.resolve();
  }
  const ctrl = new AbortController();
  const t0 = performance.now();
  const setStatus = (status: "preparing" | "analyzing" | "scoring" | "retrying") =>
    db.patchSession(id, (x) => { x.grading = { ...x.grading, status, error: null }; });

  const p = (async () => {
    db.patchSession(id, (x) => {
      x.grading = { status: "preparing", error: null, attempts: x.grading.attempts + 1, ms: null };
      x.metrics ??= analyze(x.turns, x.durationSec);
    });
    const past = db.sessions()
      .filter((x) => x.id !== id && x.report)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 5)
      .map((x) => x.report!.top_weakness);
    const args = {
      scenario: s.scenario, difficulty: s.difficulty, mode: s.mode, turns: s.turns,
      outcome: s.outcome, pastWeaknesses: past, signal: ctrl.signal, onStage: setStatus,
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const report = await gradeSession(args);
        const ms = Math.round(performance.now() - t0);
        db.patchSession(id, (x) => { x.report = report; x.grading = { ...x.grading, status: "completed", error: null, ms }; });
        log("grading_done", { ms, attempt });
        evaluateAchievements();
        return;
      } catch (e) {
        const err = e instanceof ClaudeError ? e : new ClaudeError("server", "Grading failed.");
        log("grading_error", { kind: err.kind, attempt });
        if (attempt === 0 && err.retryable && err.kind !== "rate") {
          setStatus("retrying");
          await sleep(2500, ctrl.signal).catch(() => {});
          continue;
        }
        db.patchSession(id, (x) => { x.grading = { ...x.grading, status: "failed", error: err.message }; });
        return;
      }
    }
  })().finally(() => running.delete(id));
  running.set(id, p);
  return p;
}
