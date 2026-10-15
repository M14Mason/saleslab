// Dev-only diagnostics. Never logs transcript text, keys, or personal data.
const enabled = import.meta.env.DEV || (() => { try { return localStorage.getItem("saleslab.debug") === "1"; } catch { return false; } })();
const perf: { event: string; data: Record<string, number | string | boolean>; t: number }[] = [];

export function log(event: string, data: Record<string, number | string | boolean> = {}) {
  perf.push({ event, data, t: Date.now() });
  if (perf.length > 200) perf.shift();
  if (enabled) console.debug(`[saleslab] ${event}`, data);
}

/** Recent timing events (for the diagnostics panel and tests). */
export const recentEvents = () => [...perf];
