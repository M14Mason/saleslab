// Typed, versioned local data store (this browser only). Reactive via useSyncExternalStore.
import { useSyncExternalStore } from "react";
import type { Metrics } from "../../shared/metrics";
import type { Report, Turn } from "../../shared/prompts";
import { SCENARIOS, type Difficulty, type Scenario } from "../../shared/scenarios";

export type GradingStatus = "idle" | "preparing" | "analyzing" | "scoring" | "retrying" | "completed" | "failed";

export type Session = {
  id: string;
  scenarioId: string;
  scenario: Scenario;               // snapshot, so history survives scenario edits/deletes
  difficulty: Difficulty;
  mode: "practice" | "assessment";
  liveCoaching: boolean;
  surprise: boolean;
  timeLimitSec: number | null;
  status: "active" | "ended";
  outcome: "deal" | "no_deal" | null;
  turns: Turn[];
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  grading: { status: GradingStatus; error: string | null; attempts: number; ms: number | null };
  report: Report | null;
  metrics: Metrics | null;
  perf: { firstAudioMs: number[]; firstTokenMs: number[] };
  demo?: boolean;
  legacyScore?: number | null;
};

export type Settings = {
  voiceEngine: "auto" | "natural" | "system";
  voice: string;
  speed: number;            // 0.8 - 1.4
  pauseMs: number;          // silence before your turn ends
  autoListen: boolean;
  micDeviceId: string | null;
  theme: "system" | "dark" | "light";
  reducedMotion: "system" | "on" | "off";
  liveCoaching: boolean;
  defaultDifficulty: Difficulty;
  weeklyGoal: number;
  onboarded: boolean;
  /** Extra voice depth in cents (0 normal, -200 much deeper). */
  voiceDepth: number;
  /** "smart" = Sonnet 5.5 (understands you better), "fast" = Haiku 5.5 (quicker, cheaper). */
  brain: "smart" | "fast";
  settingsVersion: number;
};

export const DEFAULT_SETTINGS: Settings = {
  voiceEngine: "auto", voice: "am_fenrir", speed: 1.0, pauseMs: 2000, autoListen: true,
  micDeviceId: null, theme: "system", reducedMotion: "system", liveCoaching: true,
  defaultDifficulty: "medium", weeklyGoal: 5, onboarded: false,
  voiceDepth: -60, brain: "smart", settingsVersion: 3,
};

export type Data = {
  version: 2;
  sessions: Session[];
  customScenarios: Scenario[];
  settings: Settings;
  achievements: Record<string, string>; // id -> ISO date unlocked
};

const KEY = "saleslab.v2";
const LEGACY = "saleslab.db";
const empty = (): Data => ({ version: 2, sessions: [], customScenarios: [], settings: { ...DEFAULT_SETTINGS }, achievements: {} });

let cache: Data | null = null;
const listeners = new Set<() => void>();

function read(): Data {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? normalize(JSON.parse(raw)) : migrateLegacy();
  } catch {
    cache = empty();
  }
  return cache;
}

/** Moves people still on old defaults to the new ones (keeps anything they changed themselves). */
function upgradeSettings(s: Settings, from: number): Settings {
  if (from < 3) {
    if (s.speed === 1.08) s.speed = 1.0;          // old default felt rushed
    if (s.pauseMs === 1600) s.pauseMs = 2000;     // old default ended turns too soon
  }
  s.settingsVersion = 3;
  return s;
}

/** Scenarios saved before buyers had a gender get the current built-in version's look/voice, or a default. */
function fixScenario(sc: Scenario): Scenario {
  if (sc.persona?.gender) return sc;
  const builtIn = SCENARIOS.find((b) => b.id === sc.id);
  return builtIn ? { ...sc, persona: { ...builtIn.persona, ...sc.persona, gender: builtIn.persona.gender, look: builtIn.persona.look, voice: builtIn.persona.voice } }
    : { ...sc, persona: { ...sc.persona, gender: "male" } };
}

function normalize(d: Partial<Data>): Data {
  return {
    version: 2,
    // Repair sessions from older/edited backups so a bad record can never crash a page.
    sessions: (Array.isArray(d.sessions) ? d.sessions : []).filter((x) => x && typeof x.id === "string").map((x) => ({
      ...x,
      scenario: fixScenario(x.scenario && x.scenario.persona ? x.scenario : (SCENARIOS.find((sc) => sc.id === x.scenarioId) ?? SCENARIOS[0])),
      turns: Array.isArray(x.turns) ? x.turns.filter((t) => t && typeof t.text === "string") : [],
      grading: x.grading ?? { status: "idle", error: null, attempts: 0, ms: null },
      perf: x.perf ?? { firstAudioMs: [], firstTokenMs: [] },
      report: x.report ?? null, metrics: x.metrics ?? null,
    })),
    customScenarios: (Array.isArray(d.customScenarios) ? d.customScenarios : []).map(fixScenario),
    settings: upgradeSettings({ ...DEFAULT_SETTINGS, ...(d.settings ?? {}) }, d.settings?.settingsVersion ?? 1),
    achievements: d.achievements ?? {},
  };
}

/** Converts data saved by the first version (sessions/messages/reports tables). */
function migrateLegacy(): Data {
  const d = empty();
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY) || "null") as Record<string, Record<string, unknown>[]> | null;
    if (!old) return d;
    for (const s of old.sessions ?? []) {
      const msgs = (old.messages ?? []).filter((m) => m.session_id === s.id).sort((a, b) => Number(a.idx) - Number(b.idx));
      const turns: Turn[] = msgs.map((m) => ({ role: m.role as Turn["role"], text: String(m.text).replace(/\[(NO_)?DEAL\]/g, "").trim(), at: 0 }));
      if (!turns.length) continue;
      d.sessions.push({
        id: String(s.id), scenarioId: "wolf-pen", scenario: SCENARIOS[0],
        difficulty: (s.difficulty as Difficulty) ?? "medium", mode: "practice", liveCoaching: false, surprise: false, timeLimitSec: null,
        status: "ended", outcome: (s.outcome === "deal" || s.outcome === "no_deal") ? s.outcome : null, turns,
        startedAt: String(s.started_at ?? new Date().toISOString()), endedAt: null, durationSec: Number(s.duration_sec ?? 0),
        grading: { status: "idle", error: null, attempts: 0, ms: null }, report: null, metrics: null,
        perf: { firstAudioMs: [], firstTokenMs: [] }, legacyScore: typeof s.score === "number" ? s.score : null,
      });
    }
  } catch { /* corrupt legacy data: start fresh */ }
  return d;
}

function write(next: Data) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded or storage blocked: keep in memory so the current call isn't lost.
    window.dispatchEvent(new CustomEvent("saleslab-storage-error"));
  }
  listeners.forEach((l) => l());
}

export function update(fn: (d: Data) => void) {
  const next = structuredClone(read());
  fn(next);
  write(next);
}

export const db = {
  get: read,
  sessions: () => read().sessions,
  session: (id: string) => read().sessions.find((s) => s.id === id) ?? null,
  settings: () => read().settings,
  setSettings: (patch: Partial<Settings>) => update((d) => { d.settings = { ...d.settings, ...patch }; }),
  upsertSession: (s: Session) => update((d) => {
    const i = d.sessions.findIndex((x) => x.id === s.id);
    if (i >= 0) d.sessions[i] = s; else d.sessions.push(s);
  }),
  patchSession: (id: string, fn: (s: Session) => void) => update((d) => { const s = d.sessions.find((x) => x.id === id); if (s) fn(s); }),
  deleteSession: (id: string) => update((d) => { d.sessions = d.sessions.filter((s) => s.id !== id); }),
  deleteAllSessions: () => update((d) => { d.sessions = []; d.achievements = {}; }),
  saveScenario: (s: Scenario) => update((d) => {
    const i = d.customScenarios.findIndex((x) => x.id === s.id);
    if (i >= 0) d.customScenarios[i] = s; else d.customScenarios.push(s);
  }),
  deleteScenario: (id: string) => update((d) => { d.customScenarios = d.customScenarios.filter((s) => s.id !== id); }),
  unlock: (ids: string[]) => update((d) => { for (const id of ids) d.achievements[id] ??= new Date().toISOString(); }),
  exportJson: () => JSON.stringify(read(), null, 2),
  importJson: (json: string) => {
    const parsed = JSON.parse(json);
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.sessions)) throw new Error("Not a SalesLab backup file.");
    const incoming = normalize(parsed);
    update((d) => {
      const ids = new Set(d.sessions.map((s) => s.id));
      d.sessions.push(...incoming.sessions.filter((s) => !ids.has(s.id)));
      const sids = new Set(d.customScenarios.map((s) => s.id));
      d.customScenarios.push(...incoming.customScenarios.filter((s) => !sids.has(s.id)));
      d.achievements = { ...incoming.achievements, ...d.achievements };
    });
  },
  wipe: () => { try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY); } catch { /* ignore */ } write(empty()); },
  /** Calls left open for 6+ hours: keep ones you spoke in (as ended, in History), drop empty ones. */
  sweepStale: (now = Date.now()) => {
    const stale = read().sessions.filter((s) => s.status === "active" && now - new Date(s.startedAt).getTime() > 6 * 3600_000);
    if (!stale.length) return 0;
    update((d) => {
      const ids = new Set(stale.map((s) => s.id));
      d.sessions = d.sessions.filter((s) => !(ids.has(s.id) && !s.turns.some((t) => t.role === "seller")));
      for (const s of d.sessions) if (ids.has(s.id)) { s.status = "ended"; s.endedAt ??= new Date(new Date(s.startedAt).getTime() + s.durationSec * 1000).toISOString(); }
    });
    return stale.length;
  },
  /** Test helper. */
  _reset: () => { cache = null; },
};

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** Whole-store snapshot (stable reference until the next write). Derive views with useMemo. */
export function useData(): Data {
  return useSyncExternalStore(subscribe, read, read);
}

// Cross-tab sync.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => { if (e.key === KEY) { cache = null; listeners.forEach((l) => l()); } });
}
