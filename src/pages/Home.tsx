import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useData } from "../lib/db";
import { isMock } from "../lib/claude";
import { dailyChallengeDone, level, recommend, skillAverages, streak, weekly } from "../lib/progress";
import { useEntrance } from "../lib/useGsap";
import { dailyScenario, CATEGORY_LABEL } from "../../shared/scenarios";
import { Bar, Radar, Trend } from "../components/Charts";
import { Empty } from "../components/ui";

export default function Home() {
  const { sessions, settings } = useData();
  const ref = useRef<HTMLDivElement>(null);
  useEntrance(ref, []);

  const v = useMemo(() => {
    const ended = sessions.filter((s) => s.status === "ended");
    const scored = ended.filter((s) => s.report).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const unfinished = sessions
      .filter((s) => s.status === "active" && s.turns.length && Date.now() - new Date(s.startedAt).getTime() < 6 * 3600_000)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const ungraded = ended.filter((s) => !s.report).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    return {
      ended, unfinished, ungraded,
      trend: scored.slice(-12).map((s) => s.report!.overall_score),
      streak: streak(sessions), level: level(sessions), week: weekly(sessions),
      daily: dailyScenario(), dailyDone: dailyChallengeDone(sessions),
      rec: recommend(sessions), skills: skillAverages(sessions),
    };
  }, [sessions]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  return (
    <div ref={ref} className="flex flex-col gap-5">
      <header data-anim className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold">{greet}. Ready to sell?</h1>
          <p className="text-mute mt-1">
            {v.streak > 0 ? `${v.streak}-day streak. ` : ""}
            {v.week.calls}/{settings.weeklyGoal} calls this week.
            {isMock() && " Demo mode: scripted buyer, no AI."}
          </p>
        </div>
        <Link to="/practice" className="btn btn-primary">Start a call</Link>
      </header>

      {v.unfinished && (
        <div data-anim className="panel p-4 flex items-center justify-between gap-3 border-you">
          <span><b>Unfinished call:</b> <span className="text-mute">{v.unfinished.scenario.title}</span></span>
          <Link className="btn btn-quiet btn-sm" to={`/call?resume=${v.unfinished.id}`}>Resume</Link>
        </div>
      )}
      {v.ungraded && !v.unfinished && (
        <div data-anim className="panel p-4 flex items-center justify-between gap-3">
          <span><b>Not graded yet:</b> <span className="text-mute">{v.ungraded.scenario.title}</span></span>
          <Link className="btn btn-quiet btn-sm" to={`/session/${v.ungraded.id}`}>Get coached</Link>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Link data-anim to={`/practice/${v.daily.scenario.id}?d=${v.daily.difficulty}`} className="panel p-5 flex flex-col gap-2 hover:border-brass transition-colors">
          <span className="text-sm text-brass font-semibold">Daily challenge {v.dailyDone && "(done today)"}</span>
          <span className="display text-2xl font-bold">{v.daily.scenario.title}</span>
          <span className="text-mute text-sm">{CATEGORY_LABEL[v.daily.scenario.category]}, {v.daily.difficulty}. {v.daily.scenario.objective}</span>
        </Link>
        <Link data-anim to={`/practice/${v.rec.scenario.id}`} className="panel p-5 flex flex-col gap-2 hover:border-brass transition-colors">
          <span className="text-sm text-you font-semibold">Recommended for you</span>
          <span className="display text-2xl font-bold">{v.rec.scenario.title}</span>
          <span className="text-mute text-sm">{v.rec.reason}</span>
        </Link>
      </div>

      {v.ended.length === 0 ? (
        <div data-anim><Empty title="No calls yet" body="Your first call takes about two minutes. Start with the pen: it's the classic." action={<Link to="/practice/wolf-pen" className="btn btn-primary">Sell the pen</Link>} /></div>
      ) : (
        <>
          <section data-anim className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="This week">
            {[
              ["Calls this week", v.week.calls],
              ["Avg score", v.week.avg ?? "--"],
              ["Deals closed", v.week.deals],
              ["Minutes", v.week.minutes],
            ].map(([k, val]) => (
              <div key={k} className="panel p-4">
                <p className="text-sm text-mute">{k}</p>
                <p className="display text-3xl font-bold num">{val}</p>
              </div>
            ))}
          </section>
          <section data-anim className="panel p-5 flex flex-col gap-2">
            <div className="flex justify-between items-baseline">
              <h2 className="text-xl font-bold">Level: {v.level.name}</h2>
              <span className="text-sm text-mute num">{v.level.xp} XP{v.level.next ? ` / ${v.level.next}` : ""}</span>
            </div>
            <Bar value={v.level.progress * 100} />
          </section>
          <div className="grid md:grid-cols-2 gap-4">
            <section data-anim className="panel p-5">
              <h2 className="text-xl font-bold mb-2">Score trend</h2>
              <Trend data={v.trend} />
            </section>
            <section data-anim className="panel p-5">
              <h2 className="text-xl font-bold mb-1">Skills, last 10 calls</h2>
              {Object.values(v.skills).some((x) => x !== null) ? <Radar values={v.skills} /> : <p className="text-sm text-mute">Get a call graded to see your skill map.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
