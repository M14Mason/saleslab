import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useData } from "../lib/db";
import { useEntrance } from "../lib/useGsap";
import { CATEGORY_LABEL, SCENARIOS, type Category } from "../../shared/scenarios";
import Face from "../components/Face";

export default function Library() {
  const { customScenarios, sessions } = useData();
  const [cat, setCat] = useState<Category | "all" | "custom">("all");
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEntrance(ref, []);

  const best = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) if (s.report) m.set(s.scenarioId, Math.max(m.get(s.scenarioId) ?? 0, s.report.overall_score));
    return m;
  }, [sessions]);

  const all = [...SCENARIOS, ...customScenarios];
  const nav = useNavigate();
  // Picks a buyer you haven't faced recently, so practice stays varied.
  function surprise() {
    const recent = new Set([...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8).map((x) => x.scenarioId));
    const pool = all.filter((x) => !recent.has(x.id));
    const pickFrom = pool.length ? pool : all;
    nav(`/practice/${pickFrom[Math.floor(Math.random() * pickFrom.length)].id}`);
  }
  const shown = all.filter((s) =>
    (cat === "all" || (cat === "custom" ? s.custom : s.category === cat)) &&
    (!q || `${s.title} ${s.industry} ${s.product} ${s.persona.name} ${s.persona.company} ${s.objective}`.toLowerCase().includes(q.toLowerCase())));
  const cats = [...new Set(SCENARIOS.map((s) => s.category))];

  return (
    <div ref={ref} className="flex flex-col gap-5">
      <header data-anim className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-extrabold">Practice</h1>
          <p className="text-mute">{all.length} buyers, each with real pain points, a budget, and objections ready. Open one and tap "Learn this field" to study it first.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={surprise}>Random buyer</button>
          <Link to="/practice/new" className="btn btn-quiet">Create a scenario</Link>
        </div>
      </header>
      <input data-anim className="field" type="search" placeholder="Search by name, industry, or goal" aria-label="Search scenarios" value={q} onChange={(e) => setQ(e.target.value)} />
      <div data-anim role="group" aria-label="Filter by type" className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
        {(["all", ...cats, ...(customScenarios.length ? ["custom" as const] : [])] as const).map((c) => (
          <button key={c} className="chip shrink-0" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c === "all" ? "All" : c === "custom" ? "Yours" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <ul className="grid md:grid-cols-2 gap-3">
        {shown.map((s) => (
          <li key={s.id} data-anim>
            <Link to={`/practice/${s.id}`} className="panel p-5 flex flex-col gap-2 h-full hover:border-brass transition-colors">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge">{s.custom ? "Your scenario" : CATEGORY_LABEL[s.category]}</span>
                <span className="badge">{s.industry}</span>
                {best.has(s.id) && <span className="badge text-good">Best {best.get(s.id)}</span>}
              </div>
              <span className="flex items-center gap-3">
                <Face persona={s.persona} size={52} className="shrink-0" />
                <span className="flex flex-col">
                  <span className="display text-xl font-bold">{s.title}</span>
                  <span className="text-sm text-mute">{s.persona.name.replace(/\s*"[^"]*"\s*/g, " ")}, {s.persona.title}</span>
                </span>
              </span>
              <span className="text-sm text-mute">{s.objective}</span>
            </Link>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="text-mute">No scenarios match. Clear the search or create your own.</p>}
    </div>
  );
}
