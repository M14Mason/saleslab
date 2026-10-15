import { useMemo, useRef } from "react";
import { useData } from "../lib/db";
import { ACHIEVEMENTS, level, skillAverages, streak, weekly } from "../lib/progress";
import { useEntrance } from "../lib/useGsap";
import { SKILLS, SKILL_LABEL } from "../../shared/prompts";
import { Bar, Radar, Trend } from "../components/Charts";
import { scoreColor } from "../components/ScoreRing";

export default function Progress() {
  const { sessions, achievements, settings } = useData();
  const ref = useRef<HTMLDivElement>(null);
  useEntrance(ref, []);
  const v = useMemo(() => {
    const scored = sessions.filter((s) => s.report).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return {
      skills: skillAverages(sessions), all: skillAverages(sessions, 1000), level: level(sessions),
      streak: streak(sessions), week: weekly(sessions), trend: scored.slice(-20).map((s) => s.report!.overall_score),
      total: sessions.filter((s) => s.status === "ended").length,
    };
  }, [sessions]);
  const got = Object.keys(achievements).length;

  return (
    <div ref={ref} className="flex flex-col gap-5">
      <h1 data-anim className="text-4xl font-extrabold">Progress</h1>

      <section data-anim className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Level", v.level.name], ["Streak", `${v.streak} day${v.streak === 1 ? "" : "s"}`], ["Total calls", v.total], ["Achievements", `${got}/${ACHIEVEMENTS.length}`]].map(([k, val]) => (
          <div key={k} className="panel p-4"><p className="text-sm text-mute">{k}</p><p className="display text-2xl font-bold num">{val}</p></div>
        ))}
      </section>

      <section data-anim className="panel p-5 flex flex-col gap-2">
        <h2 className="text-xl font-bold">Weekly goal</h2>
        <p className="text-mute text-sm">{v.week.calls} of {settings.weeklyGoal} calls in the last 7 days{v.week.avg !== null ? `, average score ${v.week.avg}` : ""}.</p>
        <Bar value={Math.min(100, (v.week.calls / settings.weeklyGoal) * 100)} color={v.week.calls >= settings.weeklyGoal ? "var(--good)" : "var(--brass)"} />
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section data-anim className="panel p-5"><h2 className="text-xl font-bold mb-2">Last 20 scores</h2><Trend data={v.trend} height={150} /></section>
        <section data-anim className="panel p-5"><h2 className="text-xl font-bold mb-1">Skill map (last 10)</h2>
          {Object.values(v.skills).some((x) => x !== null) ? <Radar values={v.skills} /> : <p className="text-sm text-mute">Appears after your first graded call.</p>}
        </section>
      </div>

      <section data-anim className="panel p-5">
        <h2 className="text-xl font-bold mb-3">Skills: recent vs all-time</h2>
        <ul className="flex flex-col gap-3">
          {SKILLS.map((k) => {
            const now = v.skills[k], all = v.all[k];
            const delta = now !== null && all !== null ? now - all : null;
            return (
              <li key={k} className="grid grid-cols-[1fr_auto] gap-x-3 items-center">
                <span>{SKILL_LABEL[k]}</span>
                <span className="num text-sm text-mute">{now ?? "n/a"}{delta ? <span className={delta > 0 ? "text-good" : "text-bad"}> {delta > 0 ? "+" : ""}{delta}</span> : null}</span>
                <div className="col-span-2 mt-1">{now !== null && <Bar value={now} color={scoreColor(now)} />}</div>
              </li>
            );
          })}
        </ul>
      </section>

      <section data-anim className="panel p-5">
        <h2 className="text-xl font-bold mb-3">Achievements</h2>
        <ul className="grid sm:grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const at = achievements[a.id];
            return (
              <li key={a.id} className={`inset p-3 ${at ? "border border-brass" : ""}`}>
                <p className={`font-semibold ${at ? "" : "text-mute"}`}>{at ? "★ " : ""}{a.title}{!at && <span className="sr-only"> (locked)</span>}</p>
                <p className="text-sm text-mute">{a.desc}{at ? ` Earned ${new Date(at).toLocaleDateString()}.` : ""}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
