import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { SessionRow } from "../lib/api";
import { summarize } from "../lib/stats";
import { useEntrance } from "../lib/useGsap";

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 300, h = 60;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / 100) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" role="img" aria-label="Score trend">
      <polyline points={pts} fill="none" stroke="var(--color-gold)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Dashboard() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [weak, setWeak] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEntrance(ref, [rows === null]);

  useEffect(() => {
    supabase.from("sessions").select("*").neq("status", "active").order("started_at", { ascending: false }).limit(200)
      .then(({ data }) => setRows((data ?? []) as SessionRow[]));
    supabase.from("reports").select("report").order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => setWeak((data ?? []).map((r) => (r.report as { top_weakness: string }).top_weakness)));
  }, []);

  if (rows === null) return <p className="text-mute">Loading...</p>;
  if (rows.length === 0)
    return (
      <div ref={ref} className="flex flex-col items-start gap-4 py-10">
        <h1 data-anim className="font-display text-4xl">No calls yet.</h1>
        <p data-anim className="text-mute">The Wolf is waiting. Your first pitch takes about 2 minutes.</p>
        <Link data-anim to="/practice" className="btn btn-gold">Start your first call</Link>
      </div>
    );

  const s = summarize(rows);
  return (
    <div ref={ref} className="flex flex-col gap-4">
      <div data-anim className="flex items-end justify-between">
        <h1 className="font-display text-4xl">Dashboard</h1>
        <Link to="/practice" className="btn btn-gold">New call</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Calls", s.sessions], ["Avg score", s.avg ?? "--"], ["Minutes", s.minutes], ["Deals closed", s.deals]].map(([k, v]) => (
          <div data-anim key={k} className="card p-4"><p className="text-xs text-mute">{k}</p><p className="font-display text-3xl">{v}</p></div>
        ))}
      </div>
      {s.trend.length > 1 && (
        <div data-anim className="card p-4">
          <p className="text-sm text-mute mb-2">Score trend {s.change != null && <span className={s.change >= 0 ? "text-good" : "text-bad"}>({s.change >= 0 ? "+" : ""}{s.change} vs previous 5)</span>}</p>
          <Sparkline data={s.trend} />
        </div>
      )}
      <div data-anim className="card p-4">
        <p className="text-sm text-mute mb-2">By difficulty</p>
        {s.byLevel.map((l) => (
          <div key={l.difficulty} className="flex justify-between py-1 capitalize"><span>{l.difficulty}</span><span className="text-mute">{l.count} calls · avg {l.avg ?? "--"}</span></div>
        ))}
      </div>
      {weak.length > 0 && (
        <div data-anim className="card p-4">
          <p className="text-sm text-mute mb-2">Recurring weak spots</p>
          <ul className="list-disc pl-5 space-y-1 text-sm">{weak.slice(0, 3).map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      <Link data-anim to="/history" className="text-sm text-gold">All sessions →</Link>
    </div>
  );
}
