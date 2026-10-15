import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { db, useData, type Session } from "../lib/db";
import { isGrading, startGrading } from "../lib/grading";
import { download, reportMarkdown, shareSummary, slug, transcriptText } from "../lib/export";
import { useEntrance, reducedMotion } from "../lib/useGsap";
import { evaluateAchievements, ACHIEVEMENTS } from "../lib/progress";
import { unlockAudio } from "../speech/tts";
import { SKILL_LABEL, type Report as R } from "../../shared/prompts";
import ScoreRing, { scoreColor } from "../components/ScoreRing";
import { Bar, Radar } from "../components/Charts";
import Confetti from "../components/Confetti";
import { Modal, Skeleton } from "../components/ui";

const STAGES = [
  { id: "preparing", label: "Preparing your transcript" },
  { id: "analyzing", label: "Analyzing the call" },
  { id: "scoring", label: "Scoring and writing feedback" },
] as const;

export default function Report() {
  const { id = "" } = useParams();
  const { sessions } = useData();
  const s = sessions.find((x) => x.id === id);
  const started = useRef(false);

  useEffect(() => {
    if (!s || started.current) return;
    started.current = true;
    // Grade automatically only right after a call. Older calls wait for a tap, so browsing history never spends credit.
    const recent = Date.now() - new Date(s.endedAt ?? s.startedAt).getTime() < 30 * 60_000;
    if (recent && s.status === "ended" && !s.report && s.grading.status !== "failed" && s.turns.some((t) => t.role === "seller")) void startGrading(s.id);
  }, [s]);

  if (!s) return <Navigate to="/history" replace />;
  if (s.report) return <Results s={s} report={s.report} />;
  return <Grading s={s} />;
}

function Grading({ s }: { s: Session }) {
  const [t0] = useState(Date.now());
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(iv); }, []);
  const st = s.grading.status;
  // A status saved as "in progress" with no live request means the app was closed mid-grading.
  const stale = ["preparing", "analyzing", "scoring", "retrying"].includes(st) && !isGrading(s.id);
  const failed = st === "failed" || stale;
  const notStarted = st === "idle" && !isGrading(s.id);
  const idx = STAGES.findIndex((x) => x.id === st);
  const secs = Math.round((Date.now() - t0) / 1000);
  const empty = !s.turns.some((t) => t.role === "seller");

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <h1 className="text-4xl font-extrabold">{notStarted ? "Not graded yet" : failed ? "Grading didn't finish" : "Your coach is reviewing the call"}</h1>
      <p className="text-mute">{s.scenario.title}, {s.difficulty}</p>
      {notStarted && (
        <div className="panel p-5 flex flex-col gap-3">
          {!empty ? <>
            <p>Get a full coaching report on this call. Uses one Claude call (a few cents).</p>
            <button className="btn btn-primary" onClick={() => void startGrading(s.id)}>Get coached</button>
          </> : <p className="text-mute">You didn't say anything on this call, so there's nothing to grade.</p>}
          <Transcript s={s} />
        </div>
      )}
      {!failed && !notStarted && (
        <ol className="panel p-5 flex flex-col gap-3" aria-live="polite">
          {STAGES.map((x, i) => {
            const state = st === "retrying" ? (i === 1 ? "now" : i < 1 ? "done" : "todo") : i < idx ? "done" : i === idx ? "now" : "todo";
            return (
              <li key={x.id} className="flex items-center gap-3">
                <span aria-hidden className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${state === "done" ? "bg-good text-bg" : state === "now" ? "bg-brass text-on-brass animate-pulse" : "bg-raised text-mute"}`}>{state === "done" ? "✓" : i + 1}</span>
                <span className={state === "todo" ? "text-mute" : ""}>{x.label}{state === "now" && st === "retrying" ? " (retrying once)" : ""}</span>
              </li>
            );
          })}
        </ol>
      )}
      {!failed && !notStarted && <><p className="text-sm text-mute num">{secs}s. Usually 15 to 40 seconds.</p><Skeleton className="h-28" /><Skeleton className="h-20" /></>}
      {failed && (
        <div className="panel p-5 flex flex-col gap-3">
          <p className="text-bad" role="alert">{stale ? "The app was closed while grading. Your transcript is saved." : s.grading.error}</p>
          {!empty && <button className="btn btn-primary" onClick={() => void startGrading(s.id, { force: true })}>Retry grading</button>}
          <p className="text-xs text-mute">Each retry is one Claude call. Attempts so far: {s.grading.attempts}.</p>
          <Transcript s={s} />
        </div>
      )}
      <Link to="/history" className="text-sm text-mute">Back to history</Link>
    </div>
  );
}

function Results({ s, report: r }: { s: Session; report: R }) {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [focusTurn, setFocusTurn] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copied, setCopied] = useState(false);
  const fresh = useRef(Date.now() - new Date(s.endedAt ?? s.startedAt).getTime() < 5 * 60_000);
  // Achievements earned since this call ended (grading unlocks them; this catches older sessions too).
  const { achievements } = useData();
  useEffect(() => { evaluateAchievements(); }, []); // never write to the store during render
  const since = s.endedAt ?? s.startedAt;
  const unlocked = ACHIEVEMENTS.filter((a) => achievements[a.id] && achievements[a.id] >= since);
  useEntrance(ref, []);
  const m = s.metrics;
  const radar = useMemo(() => Object.fromEntries(r.skills.filter((k) => k.score !== null).map((k) => [k.name, k.score])), [r]);
  const firstAudio = s.perf.firstAudioMs.length ? Math.round(s.perf.firstAudioMs.reduce((a, b) => a + b, 0) / s.perf.firstAudioMs.length / 100) / 10 : null;

  function jump(turn: number) {
    setFocusTurn(turn);
    requestAnimationFrame(() => document.getElementById(`turn-${turn}`)?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }));
  }

  async function share() {
    const text = shareSummary(s);
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* user cancelled */ }
  }

  return (
    <div ref={ref} className="flex flex-col gap-5">
      <Confetti fire={fresh.current && (r.outcome === "deal" || r.overall_score >= 80)} />
      <Link data-anim to="/history" className="text-sm text-mute hover:text-ink w-fit">Back to history</Link>

      <section data-anim className="panel p-5 md:p-6 flex flex-col items-center text-center sm:text-left sm:flex-row gap-5 sm:items-center">
        <ScoreRing score={r.overall_score} />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2 items-center justify-center sm:justify-start">
            <span className={`badge ${r.outcome === "deal" ? "text-good" : r.outcome === "no_deal" ? "text-bad" : ""}`}>{r.outcome === "deal" ? "Deal closed" : r.outcome === "no_deal" ? "No deal" : "Incomplete"}</span>
            <span className="badge">{s.difficulty}</span>
            <span className="badge">{s.mode}</span>
            {s.demo && <span className="badge">Demo report</span>}
          </div>
          <h1 className="text-3xl font-extrabold">{s.scenario.title}</h1>
          <p>{r.summary}</p>
        </div>
      </section>

      {s.grading.status === "failed" && s.grading.error && (
        <div data-anim role="alert" className="panel p-4 text-sm"><span className="text-bad">Re-grade failed:</span> {s.grading.error} Your previous report is still shown.</div>
      )}

      {unlocked.length > 0 && (
        <section data-anim className="panel p-4 border-brass" aria-label="New achievements">
          <p className="font-semibold text-brass">Achievement unlocked</p>
          <p>{unlocked.map((a) => a.title).join(", ")}</p>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <section data-anim className="panel p-5"><p className="text-sm text-good font-semibold mb-1">Biggest strength</p><p>{r.top_strength}</p></section>
        <section data-anim className="panel p-5"><p className="text-sm text-bad font-semibold mb-1">Biggest weakness</p><p>{r.top_weakness}</p></section>
      </div>

      <section data-anim className="panel p-5">
        <h2 className="text-xl font-bold mb-3">Fix these three things</h2>
        <ol className="flex flex-col gap-2">{r.top_improvements.map((t, i) => (
          <li key={i} className="flex gap-3"><span className="display font-extrabold text-brass">{i + 1}</span><span>{t}</span></li>
        ))}</ol>
      </section>

      <div className="grid md:grid-cols-[1fr_320px] gap-4">
        <section data-anim className="panel p-5">
          <h2 className="text-xl font-bold mb-3">How each score was earned</h2>
          <ul className="flex flex-col gap-4">
            {r.skills.map((k) => (
              <li key={k.name}>
                <div className="flex justify-between gap-2"><span className="font-medium">{SKILL_LABEL[k.name]}</span><span className="num text-mute">{k.score ?? "n/a"}</span></div>
                {k.score !== null && <div className="my-1"><Bar value={k.score} color={scoreColor(k.score)} /></div>}
                <p className="text-sm text-mute">{k.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
        <div className="flex flex-col gap-4">
          {Object.keys(radar).length >= 3 && <section data-anim className="panel p-4"><Radar values={radar} /></section>}
          {m && (
            <section data-anim className="panel p-5 flex flex-col gap-3" aria-label="Delivery stats">
              <h2 className="text-lg font-bold">Delivery</h2>
              <div>
                <div className="flex justify-between text-sm"><span>You talked</span><span className="num">{m.talkRatio}%</span></div>
                <Bar value={m.talkRatio} color={m.talkRatio > 65 ? "var(--bad)" : "var(--you)"} />
                <p className="text-xs text-mute mt-1">Aim for under 60% on discovery calls.</p>
              </div>
              <p className="text-sm">Questions: <b className="num">{m.questions}</b> ({m.openQuestions} open-ended)</p>
              <p className="text-sm">Filler words: <b className="num">{m.fillerCount}</b>{m.fillerCount > 0 && <span className="text-mute"> ({Object.entries(m.fillers).map(([k, v]) => `${k} x${v}`).join(", ")})</span>}</p>
              <p className="text-sm">Longest answer: <b className="num">{m.longestTurnWords}</b> words</p>
              <p className="text-sm">Call length: <b className="num">{Math.floor(s.durationSec / 60)}m {s.durationSec % 60}s</b></p>
              {firstAudio !== null && <p className="text-xs text-mute">Buyer response time: {firstAudio}s average</p>}
              <p className="text-xs text-mute">Based on the transcript only, not your tone of voice.</p>
            </section>
          )}
        </div>
      </div>

      {r.alternatives.length > 0 && (
        <section data-anim className="panel p-5 flex flex-col gap-4">
          <h2 className="text-xl font-bold">Say this instead</h2>
          {r.alternatives.map((a, i) => (
            <div key={i} className="inset p-4 flex flex-col gap-1.5">
              <p><span className="text-you font-semibold">You said:</span> "{a.original}" <button className="text-xs text-mute underline" onClick={() => jump(a.turn)}>see in transcript</button></p>
              <p className="text-sm text-mute">{a.problem}</p>
              <p><span className="text-good font-semibold">Try:</span> "{a.better}"</p>
              <p className="text-sm text-mute">{a.why}</p>
            </div>
          ))}
        </section>
      )}

      {r.key_moments.length > 0 && (
        <section data-anim className="panel p-5 flex flex-col gap-3">
          <h2 className="text-xl font-bold">Key moments</h2>
          {r.key_moments.map((k, i) => (
            <button key={i} className="text-left inset p-3 hover:outline hover:outline-1 hover:outline-line" onClick={() => jump(k.turn)}>
              <span className={`badge mr-2 ${k.kind === "strength" ? "text-good" : "text-bad"}`}>{k.kind === "strength" ? "Strong" : k.kind === "missed" ? "Missed chance" : "Weak spot"}</span>
              <span className="italic">"{k.quote}"</span>
              <span className="block text-sm text-mute mt-1">{k.analysis}</span>
            </button>
          ))}
        </section>
      )}

      {r.objections.length > 0 && (
        <section data-anim className="panel p-5 flex flex-col gap-2">
          <h2 className="text-xl font-bold">Objections</h2>
          {r.objections.map((o, i) => (
            <p key={i} className="text-sm"><span className={o.handled ? "text-good" : "text-bad"}>{o.handled ? "Handled" : "Not handled"}:</span> "{o.objection}". <span className="text-mute">{o.note}</span></p>
          ))}
        </section>
      )}

      {r.compliance_flags.length > 0 && (
        <section data-anim className="panel p-5 border-bad">
          <h2 className="text-xl font-bold text-bad">Watch out</h2>
          <ul className="list-disc pl-5 text-sm">{r.compliance_flags.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </section>
      )}

      <section data-anim className="panel p-5 border-brass">
        <h2 className="text-xl font-bold mb-2">Your practice plan</h2>
        <ol className="list-decimal pl-5 flex flex-col gap-1">{r.practice_plan.map((p, i) => <li key={i}>{p}</li>)}</ol>
        <p className="mt-3"><b className="text-brass">Next call objective:</b> {r.next_objective}</p>
      </section>

      <section data-anim className="panel p-5"><Transcript s={s} focusTurn={focusTurn} highlights={new Set([...r.key_moments.map((k) => k.turn), ...r.alternatives.map((a) => a.turn)])} /></section>

      <div data-anim className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => { unlockAudio(); nav("/call", { state: { setup: { scenario: s.scenario, difficulty: s.difficulty, mode: s.mode, liveCoaching: s.liveCoaching, surprise: s.surprise, timeLimitSec: s.timeLimitSec } } }); }}>Run it back</button>
        <button className="btn btn-quiet" onClick={() => download(`saleslab-${slug(s.scenario.title)}.md`, reportMarkdown(s), "text/markdown")}>Export report</button>
        <button className="btn btn-quiet" onClick={() => download(`transcript-${slug(s.scenario.title)}.txt`, transcriptText(s))}>Download transcript</button>
        <button className="btn btn-quiet" onClick={share}>{copied ? "Copied" : "Share summary"}</button>
        <button className="btn btn-quiet" disabled={isGrading(s.id)} onClick={() => void startGrading(s.id, { force: true })} title="Uses one Claude call">{isGrading(s.id) ? "Re-grading..." : "Re-grade"}</button>
        <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Delete</button>
      </div>
      <p className="text-xs text-mute">AI-generated coaching based only on your transcript. Practice feedback, not a prediction of real-world results.</p>

      <Modal open={confirmDel} title="Delete this call?" onClose={() => setConfirmDel(false)}>
        <p className="text-mute">The transcript and report are removed from this browser. This can't be undone.</p>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-quiet" onClick={() => setConfirmDel(false)}>Keep it</button>
          <button className="btn btn-danger" onClick={() => { db.deleteSession(s.id); nav("/history", { replace: true }); }}>Delete call</button>
        </div>
      </Modal>
    </div>
  );
}

function Transcript({ s, focusTurn = null, highlights = new Set<number>() }: { s: Session; focusTurn?: number | null; highlights?: Set<number> }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(focusTurn !== null);
  useEffect(() => { if (focusTurn !== null) setOpen(true); }, [focusTurn]);
  const buyer = s.scenario.persona.name.replace(/\s*"[^"]*"\s*/g, " ").trim().split(" ")[0];
  const lines = [{ role: "buyer" as const, text: s.scenario.opener, interrupted: false }, ...s.turns];
  const mark = (text: string) => {
    if (!q.trim()) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
  };
  const shown = lines.map((l, i) => ({ ...l, i })).filter((l) => !q.trim() || l.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      <button className="flex justify-between items-center text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <h2 className="text-xl font-bold">Transcript</h2><span className="text-sm text-mute">{open ? "Hide" : `Show ${lines.length} lines`}</span>
      </button>
      {open && <>
        <input className="field" type="search" placeholder="Search the transcript" aria-label="Search the transcript" value={q} onChange={(e) => setQ(e.target.value)} />
        <ol className="flex flex-col gap-2">
          {shown.map((l) => (
            <li key={l.i} id={`turn-${l.i}`} className={`p-2 rounded-lg transition-colors ${focusTurn === l.i ? "bg-raised outline outline-2 outline-brass" : highlights.has(l.i) ? "bg-raised" : ""}`}>
              <span className={`font-semibold ${l.role === "seller" ? "text-you" : "text-buyer"}`}>{l.role === "seller" ? "You" : buyer}: </span>
              {mark(l.text)}{l.interrupted && <span className="text-mute text-sm"> (cut off)</span>}
              {highlights.has(l.i) && <span className="sr-only"> (coaching moment)</span>}
            </li>
          ))}
        </ol>
        {!shown.length && <p className="text-sm text-mute">No lines match "{q}".</p>}
      </>}
    </div>
  );
}
