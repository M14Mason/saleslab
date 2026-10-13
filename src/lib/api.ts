import { supabase } from "./supabase";
import type { CoachReport } from "../../shared/schemas";

async function call<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again.");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("Timed out. Check your connection.");
    if (e instanceof TypeError) throw new Error("No connection. Check your internet.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export const converse = (sessionId: string, idx: number, text: string) =>
  call<{ reply: string; outcome: "deal" | "no_deal" | null }>("/api/converse", { sessionId, idx, text }, 30_000);

export const coach = (sessionId: string) =>
  call<{ report: CoachReport; cached: boolean }>("/api/coach", { sessionId }, 90_000);

export type SessionRow = {
  id: string; difficulty: "easy" | "medium" | "hard"; status: string;
  outcome: "deal" | "no_deal" | "incomplete" | null; score: number | null;
  started_at: string; duration_sec: number | null;
};
