import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import gsap from "gsap";
import { useCall, type CallSetup, type CallState } from "../call/useCall";
import { db } from "../lib/db";
import { reducedMotion } from "../lib/theme";
import { unlockAudio } from "../speech/tts";
import Waveform from "../components/Waveform";
const GLCanvas = lazy(() => import("../gl/GLCanvas"));
import Confetti from "../components/Confetti";
import { Modal } from "../components/ui";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function Call() {
  const loc = useLocation() as { state?: { setup?: CallSetup } };
  const [params] = useSearchParams();
  const resumeId = params.get("resume");
  const resumeSession = resumeId ? db.session(resumeId) : null;
  // A finished call (e.g. reached with the Back button) goes to its report, never silently starts a new call.
  if (resumeId && !loc.state?.setup) {
    if (!resumeSession) return <Navigate to="/" replace />;
    if (resumeSession.status !== "active") return <Navigate to={`/session/${resumeSession.id}`} replace />;
  }
  const setup: CallSetup | null = loc.state?.setup ?? (resumeSession ? {
    scenario: resumeSession.scenario, difficulty: resumeSession.difficulty, mode: resumeSession.mode,
    liveCoaching: resumeSession.liveCoaching, surprise: resumeSession.surprise, timeLimitSec: resumeSession.timeLimitSec,
  } : null);
  if (!setup) return <Navigate to="/practice" replace />;
  return <Live setup={setup} resumeId={resumeSession?.status === "active" ? resumeSession.id : null} />;
}

function Live({ setup, resumeId }: { setup: CallSetup; resumeId: string | null }) {
  const nav = useNavigate();
  const c = useCall();
  const [started, setStarted] = useState(false);
  const startOnce = useRef(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [typing, setTyping] = useState(!c.voiceIn);
  const [typed, setTyped] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [, force] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const buyer = setup.scenario.persona.name.replace(/\s*"[^"]*"\s*/g, " ").trim();
  const first = buyer.split(" ")[0];

  // Fresh calls start immediately (the tap on "Start call" already unlocked audio).
  useEffect(() => {
    if (!resumeId && !startOnce.current) {
      startOnce.current = true; setStarted(true);
      void c.start(setup);
      // Put the session in the URL so a reload offers "Resume" instead of starting a second call.
      const id = c.sessionId();
      if (id) nav(`/call?resume=${id}`, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!started) return;
    const t0 = Date.now() - elapsed * 1000;
    const iv = setInterval(() => { setElapsed(Math.round((Date.now() - t0) / 1000)); if (c.thinkingSince) force((n) => n + 1); }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, c.thinkingSince]);

  useEffect(() => { if (!c.voiceIn) setTyping(true); }, [c.voiceIn]);
  useEffect(() => { c.setTyping(typing); }, [typing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: "end", behavior: reducedMotion() ? "auto" : "smooth" }); }, [c.turns.length, c.streaming, c.interim, showTranscript]);

  // Animate state changes on the stage.
  useLayoutEffect(() => {
    if (!stage.current || reducedMotion()) return;
    gsap.fromTo(stage.current.querySelector("[data-state-label]"), { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.2 });
  }, [c.state]);

  function endCall() {
    const id = c.end();
    setConfirmEnd(false);
    nav(id ? `/session/${id}` : "/", { replace: true });
  }

  function mainAction() {
    if (c.outcome) return endCall();
    if (c.state === "buyer" || c.state === "thinking") return c.interrupt();
    if (c.state === "listening") return c.sendNow();
    if (c.state === "paused") return c.resume();
    if (c.state === "error" && c.error?.retry) return c.retry();
    if (typing) return;
    return c.listen();
  }

  // Keyboard shortcuts: Space = main action, Esc = end, M = mute, P = pause/resume.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || confirmEnd) return;
      if (e.code === "Space") { e.preventDefault(); mainAction(); }
      else if (e.key === "Escape") setConfirmEnd(true);
      else if (e.key.toLowerCase() === "m") c.toggleMute();
      else if (e.key.toLowerCase() === "p") (c.state === "paused" ? c.resume() : c.pause());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    const t = typed.trim();
    if (!t || c.state === "thinking") return;
    setTyped("");
    void c.submitText(t);
  }

  const thinkingFor = c.thinkingSince ? (Date.now() - c.thinkingSince) / 1000 : 0;
  const label = useMemo(() => {
    const L: Record<CallState, string> = {
      idle: typing ? "Your turn. Type your line." : "Your turn. Tap Talk.",
      buyer: `${first} is talking`,
      listening: "Listening. Pause when you're done.",
      thinking: `${first} is thinking`,
      paused: "Paused",
      error: "Something went wrong",
      ended: "Call ended",
    };
    if (c.outcome === "deal") return "Deal closed!";
    if (c.outcome === "no_deal") return `${first} walked away. No deal.`;
    return L[c.state];
  }, [c.state, c.outcome, first, typing]);

  const who = c.state === "listening" ? "you" : c.state === "buyer" ? "buyer" : c.state === "thinking" ? "thinking" : "idle";
  const mainLabel = c.outcome ? "Get coached" : c.state === "buyer" || c.state === "thinking" ? "Interrupt" : c.state === "listening" ? "Send" : c.state === "paused" ? "Resume" : c.state === "error" && c.error?.retry ? "Retry" : "Talk";
  const timeText = c.remaining !== null ? `${fmt(c.remaining)} left` : fmt(elapsed);
  const lastTurns = c.turns.slice(-2);

  if (resumeId && !started) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-4xl font-extrabold">Pick up where you left off</h1>
        <p className="text-mute">{setup.scenario.title} with {buyer}</p>
        <button className="btn btn-primary text-lg" onClick={() => { unlockAudio(); setStarted(true); void c.start(setup, db.session(resumeId)!); }}>Resume call</button>
        <button className="btn btn-quiet" onClick={() => nav("/")}>Not now</button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col safe-t">
      <Confetti fire={c.outcome === "deal"} />
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
        <div className="min-w-0">
          <p className="font-semibold truncate">{buyer}</p>
          <p className="text-xs text-mute truncate">{setup.scenario.title}: {setup.difficulty}, {setup.mode}. AI character.</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`num text-sm px-2 ${c.remaining !== null && c.remaining < 30 ? "text-bad" : "text-mute"}`} aria-label={`Time ${timeText}`}>{timeText}</span>
          <button className="btn btn-quiet btn-sm" onClick={c.toggleMute} aria-pressed={c.muted} aria-label={c.muted ? "Unmute buyer" : "Mute buyer"}>{c.muted ? "Unmute" : "Mute"}</button>
          <button className="btn btn-quiet btn-sm hidden sm:inline-flex" onClick={() => (c.state === "paused" ? c.resume() : c.pause())}>{c.state === "paused" ? "Resume" : "Pause"}</button>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmEnd(true)}>End</button>
        </div>
      </header>

      <div ref={stage} className="flex-1 w-full max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <div aria-hidden className="relative w-44 h-44 sm:w-52 sm:h-52 -my-6">
            <Suspense fallback={null}>
              <GLCanvas variant="orb" level={c.level} mode={who === "idle" ? "idle" : who} className="absolute inset-0 w-full h-full rounded-full" scale={0.75} />
            </Suspense>
            <span className="absolute inset-0 flex items-center justify-center display font-extrabold text-3xl text-ink">
              {buyer.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
          </div>
          <p data-state-label role="status" aria-live="polite" className={`display text-2xl font-bold ${c.outcome === "deal" ? "text-good" : c.outcome === "no_deal" ? "text-bad" : ""}`}>
            {label}{c.state === "thinking" && <span className="num text-mute text-base font-normal"> {thinkingFor.toFixed(1)}s</span>}
          </p>
          {c.state === "thinking" && thinkingFor > 8 && <p className="text-sm text-mute">Taking longer than usual. Hang tight, or tap Interrupt to try again.</p>}
        </div>

        <div className="panel px-3 py-2">
          <Waveform level={c.level} who={who} active={c.state === "listening" || c.state === "buyer" || c.state === "thinking"} />
        </div>

        {/* Live captions: buyer text as it streams, your words as you speak */}
        <div className="min-h-[4.5rem] text-lg leading-snug" aria-live="polite">
          {c.streaming ? <p className="text-buyer caret">{c.streaming}</p>
            : c.interim ? <p className="text-you">{c.interim}</p>
            : lastTurns.map((t, i) => (
              <p key={i} className={t.role === "seller" ? "text-you/80 text-base" : "text-buyer"}>{t.role === "seller" ? "You: " : ""}{t.text}</p>
            ))}
        </div>

        {c.hint && (
          <div role="note" className="panel p-3 flex items-start justify-between gap-3 border-brass">
            <p className="text-sm"><b className="text-brass">Coach:</b> {c.hint}</p>
            <button className="text-mute text-sm shrink-0" onClick={c.dismissHint} aria-label="Dismiss tip">Hide</button>
          </div>
        )}
        {c.micWarning && (
          <div role="alert" className="panel p-3 flex items-start justify-between gap-3">
            <p className="text-sm text-bad">{c.micWarning}</p>
            <button className="text-mute text-sm shrink-0" onClick={c.dismissMicWarning}>Hide</button>
          </div>
        )}
        {c.error && (
          <div role="alert" className="panel p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-bad">{c.error.message}</p>
            {c.error.retry && <button className="btn btn-quiet btn-sm shrink-0" onClick={c.retry}>Retry</button>}
          </div>
        )}

        <button className="text-sm text-mute w-fit" aria-expanded={showTranscript} onClick={() => setShowTranscript((v) => !v)}>
          {showTranscript ? "Hide" : "Show"} full transcript ({c.turns.length + 1} lines)
        </button>
        {showTranscript && (
          <div className="panel p-4 max-h-[40dvh] overflow-y-auto flex flex-col gap-2 text-sm" aria-label="Transcript">
            <p className="text-buyer"><b>{first}:</b> {setup.scenario.opener}</p>
            {c.turns.map((t, i) => (
              <p key={i} className={t.role === "seller" ? "text-you" : "text-buyer"}>
                <b>{t.role === "seller" ? "You" : first}:</b> {t.text}{t.interrupted && <span className="text-mute"> (cut off)</span>}
              </p>
            ))}
            <div ref={transcriptEnd} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-bg/95 backdrop-blur border-t border-line px-4 pt-3 pb-4 safe-b">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {typing && !c.outcome && (
            <form onSubmit={submitTyped} className="flex gap-2">
              <input className="field" aria-label="Type your line" placeholder="Type what you'd say" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={c.state === "thinking"} enterKeyHint="send" />
              <button className="btn btn-primary" disabled={!typed.trim() || c.state === "thinking"}>Send</button>
            </form>
          )}
          <div className="flex items-center justify-center gap-3">
            {c.state === "listening" && <button className="btn btn-quiet btn-sm" onClick={c.reRecord}>Re-record</button>}
            {(!typing || c.outcome || c.state === "buyer" || c.state === "thinking" || c.state === "paused" || (c.state === "error" && c.error?.retry)) && (
              <button onClick={mainAction} disabled={!started}
                className={`rounded-full font-bold text-lg min-w-[8.5rem] h-16 px-6 transition-transform active:scale-95 ${c.state === "listening" ? "bg-you text-bg" : c.outcome ? "bg-good text-bg" : c.state === "buyer" || c.state === "thinking" ? "bg-raised text-ink border border-line" : "bg-brass text-on-brass"}`}>
                {mainLabel}
              </button>
            )}
            {c.voiceIn && !c.outcome && (
              <button className="btn btn-quiet btn-sm" onClick={() => setTyping((v) => !v)} aria-pressed={typing}>{typing ? "Use voice" : "Type"}</button>
            )}
          </div>
          <p className="text-center text-xs text-mute hidden md:block">Space: {mainLabel.toLowerCase()}. M: mute. P: pause. Esc: end call.</p>
        </div>
      </div>

      <Modal open={confirmEnd} title="End the call?" onClose={() => setConfirmEnd(false)}>
        <p className="text-mute">{c.turns.some((t) => t.role === "seller") ? "You'll get your coaching report next." : "You haven't said anything yet, so nothing will be saved."}</p>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-quiet" onClick={() => setConfirmEnd(false)}>Keep going</button>
          <button className="btn btn-primary" onClick={endCall}>End call</button>
        </div>
      </Modal>
    </div>
  );
}
