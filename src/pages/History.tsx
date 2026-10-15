import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../lib/db";
import { useEntrance } from "../lib/useGsap";
import { CATEGORY_LABEL } from "../../shared/scenarios";
import { scoreColor } from "../components/ScoreRing";
import { Empty } from "../components/ui";

export default function History() {
  const { sessions } = useData();
  const [diff, setDiff] = useState("all");
  const [out, setOut] = useState("all");
  const [days, setDays] = useState("all");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEntrance(ref, []);

  const ended = useMemo(() => sessions.filter((s) => s.status === "ended").sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [sessions]);
  const shown = ended.filter((s) =>
    (diff === "all" || s.difficulty === diff) &&
    (out === "all" || (out === "incomplete" ? !s.outcome : s.outcome === out)) &&
    (cat === "all" || s.scenario.category === cat) &&
    (days === "all" || Date.now() - new Date(s.startedAt).getTime() < Number(days) * 86400_000) &&
    (!q.trim() || `${s.scenario.title} ${s.turns.map((t) => t.text).join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const cats = [...new Set(ended.map((s) => s.scenario.category))];

  if (!ended.length) {
    return <div ref={ref} className="flex flex-col gap-4"><h1 data-anim className="text-4xl font-extrabold">History</h1>
      <div data-anim><Empty title="Nothing here yet" body="Finished calls show up here with their transcript and coaching report." action={<Link to="/practice" className="btn btn-primary">Start a call</Link>} /></div></div>;
  }

  return (
    <div ref={ref} className="flex flex-col gap-4">
      <h1 data-anim className="text-4xl font-extrabold">History</h1>
      <input data-anim className="field" type="search" placeholder="Search calls and transcripts" aria-label="Search calls and transcripts" value={q} onChange={(e) => setQ(e.target.value)} />
      <div data-anim className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <select className="field" aria-label="Type" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All types</option>{cats.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select className="field" aria-label="Difficulty" value={diff} onChange={(e) => setDiff(e.target.value)}>
          <option value="all">All levels</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <select className="field" aria-label="Outcome" value={out} onChange={(e) => setOut(e.target.value)}>
          <option value="all">All outcomes</option><option value="deal">Deal</option><option value="no_deal">No deal</option><option value="incomplete">Incomplete</option>
        </select>
        <select className="field" aria-label="Date range" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
        </select>
      </div>
      <p className="text-sm text-mute" aria-live="polite">{shown.length} of {ended.length} calls</p>
      <ul className="flex flex-col gap-2">
        {shown.map((s) => {
          const score = s.report?.overall_score ?? s.legacyScore ?? null;
          return (
            <li key={s.id}>
              <Link to={`/session/${s.id}`} className="panel p-4 flex items-center justify-between gap-3 hover:border-brass transition-colors">
                <span className="min-w-0">
                  <span className="block font-semibold truncate">{s.scenario.title}</span>
                  <span className="block text-sm text-mute">
                    {new Date(s.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, {s.difficulty}, {s.outcome === "deal" ? "deal" : s.outcome === "no_deal" ? "no deal" : "incomplete"}
                    {!s.report && ", not graded"}{s.demo && ", demo"}
                  </span>
                </span>
                <span className="display text-3xl font-bold num shrink-0" style={{ color: score !== null ? scoreColor(score) : undefined }}>{score ?? "--"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {!shown.length && <p className="text-mute">No calls match these filters.</p>}
    </div>
  );
}
