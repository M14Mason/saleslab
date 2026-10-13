import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { SessionRow } from "../lib/api";

export default function History() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [diff, setDiff] = useState("all");
  const [out, setOut] = useState("all");
  const [days, setDays] = useState("all");

  useEffect(() => {
    supabase.from("sessions").select("*").neq("status", "active").order("started_at", { ascending: false }).limit(500)
      .then(({ data }) => setRows((data ?? []) as SessionRow[]));
  }, []);

  const filtered = useMemo(() => (rows ?? []).filter((r) =>
    (diff === "all" || r.difficulty === diff) &&
    (out === "all" || r.outcome === out) &&
    (days === "all" || Date.now() - new Date(r.started_at).getTime() < Number(days) * 86400_000)), [rows, diff, out, days]);

  const sel = "bg-panel border border-line rounded-xl min-h-11 px-3 text-sm";
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-4xl">History</h1>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Difficulty" className={sel} value={diff} onChange={(e) => setDiff(e.target.value)}>
          <option value="all">All levels</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <select aria-label="Outcome" className={sel} value={out} onChange={(e) => setOut(e.target.value)}>
          <option value="all">All outcomes</option><option value="deal">Deal</option><option value="no_deal">No deal</option><option value="incomplete">Incomplete</option>
        </select>
        <select aria-label="Date range" className={sel} value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
        </select>
      </div>
      {rows === null && <p className="text-mute">Loading...</p>}
      {rows && filtered.length === 0 && <p className="text-mute">Nothing here yet. <Link className="text-gold" to="/practice">Start a call</Link>.</p>}
      <ul className="flex flex-col gap-2">
        {filtered.map((r) => (
          <li key={r.id}>
            <Link to={`/session/${r.id}`} className="card p-4 flex items-center justify-between">
              <span>
                <span className="block">{new Date(r.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className="text-sm text-mute capitalize">{r.difficulty} · {r.outcome?.replace("_", " ") ?? (r.status === "ended" ? "not coached yet" : r.status)}</span>
              </span>
              <span className="font-display text-3xl">{r.score ?? "--"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
