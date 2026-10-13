import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import Orb, { type OrbState } from "../components/Orb";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { converse } from "../lib/api";
import { reducedMotion } from "../lib/useGsap";
import { listenOnce, sttSupported, type SttError } from "../speech/stt";
import { Speaker, type VoiceId } from "../speech/tts";
import { WOLF, type Difficulty } from "../../shared/wolf";
import { MAX_TURNS, type Turn } from "../../shared/schemas";
import { loadSettings } from "./Settings";

const LEVELS: { id: Difficulty; label: string; desc: string }[] = [
  { id: "easy", label: "Easy", desc: "Receptive buyer. Room to recover." },
  { id: "medium", label: "Medium", desc: "Skeptical. You must find his need." },
  { id: "hard", label: "Hard", desc: "Tough negotiator. Will walk." },
];

const STATUS: Record<OrbState, string> = {
  idle: "Tap the mic to talk",
  listening: "Listening...",
  thinking: "The Wolf is thinking...",
  speaking: "The Wolf is talking",
};

const STT_HELP: Record<SttError, string> = {
  denied: "Microphone blocked. iPhone: Settings > Safari > Microphone > Allow, and turn on Siri (Settings > Siri). Windows Chrome: click the lock icon in the address bar > Microphone > Allow.",
  "no-speech": "Didn't hear anything. Tap the mic and talk.",
  network: "Speech recognition needs internet. Check your connection.",
  unsupported: "This browser can't do speech recognition. Use Chrome or Edge on Windows, or Safari on iPhone.",
  other: "Mic hiccup. Tap the mic and try again.",
};

export default function Practice() {
  const nav = useNavigate();
  const { session } = useAuth();
  const settings = loadSettings();
  const [difficulty, setDifficulty] = useState<Difficulty>(settings.difficulty);
  const [phase, setPhase] = useState<"setup" | "loading" | "live">("setup");
  const [orb, setOrb] = useState<OrbState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadMsg, setLoadMsg] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"deal" | "no_deal" | null>(null);
  const [resumable, setResumable] = useState<{ id: string; difficulty: Difficulty } | null>(null);
  const [typed, setTyped] = useState("");
  const [muted, setMuted] = useState(false);
  const [voiceInOk, setVoiceInOk] = useState(sttSupported());

  // Refs mirror state so async callbacks never read stale values.
  const turnsRef = useRef<Turn[]>([]);
  const orbRef = useRef<OrbState>("idle");
  const outcomeRef = useRef<"deal" | "no_deal" | null>(null);
  const setOrbS = (o: OrbState) => { orbRef.current = o; setOrb(o); };
  const setTurnsS = (t: Turn[]) => { turnsRef.current = t; setTurns(t); };
  const speaker = useRef<Speaker | null>(null);
  const stopListen = useRef<(() => void) | null>(null);
  const startedAt = useRef(0);
  const live = useRef<HTMLDivElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  // Find an interrupted session from the last 2 hours.
  useEffect(() => {
    const since = new Date(Date.now() - 2 * 3600_000).toISOString();
    supabase.from("sessions").select("id, difficulty").eq("status", "active").gte("started_at", since)
      .order("started_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => data && setResumable(data as { id: string; difficulty: Difficulty }));
    return () => { stopListen.current?.(); speaker.current?.dispose(); };
  }, []);

  // Stop the mic if the app goes to the background. Phones can't record while locked.
  useEffect(() => {
    const h = () => { if (document.hidden) { stopListen.current?.(); speaker.current?.stop(); } };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  useEffect(() => { transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, interim]);

  async function prepareVoice() {
    speaker.current ??= new Speaker(settings.voice as VoiceId);
    speaker.current.unlock(); // inside the tap handler: required by iOS
    setPhase("loading");
    await speaker.current.load(setLoadMsg);
  }

  async function start() {
    setError(null);
    await prepareVoice();
    const { data, error: e } = await supabase.from("sessions")
      .insert({ user_id: session!.user.id, difficulty }).select("id").single();
    if (e || !data) { setPhase("setup"); return setError("Couldn't start a session. Check your connection."); }
    setSessionId(data.id);
    beginLive([]);
  }

  async function resume() {
    if (!resumable) return;
    setDifficulty(resumable.difficulty);
    await prepareVoice();
    const { data } = await supabase.from("messages").select("role, text").eq("session_id", resumable.id).order("idx");
    setSessionId(resumable.id);
    beginLive(((data ?? []) as Turn[]).map((t) => ({ ...t, text: t.text.replace(/\[(NO_)?DEAL\]/g, "").trim() })));
  }

  function beginLive(existing: Turn[]) {
    setTurnsS(existing);
    setPhase("live");
    startedAt.current = Date.now();
    requestAnimationFrame(() => {
      if (live.current && !reducedMotion()) gsap.from(live.current, { opacity: 0, y: 20, duration: 0.5, ease: "power2.out" });
    });
    if (existing.length === 0) void say(WOLF.opener);
  }

  async function say(text: string) {
    setOrbS("speaking");
    await speaker.current?.speak(text);
    setOrbS("idle");
    if (settings.autoListen && voiceInOk && !outcomeRef.current) void listen();
  }

  async function listen() {
    if (orbRef.current === "listening" || orbRef.current === "thinking") return;
    speaker.current?.stop();
    setError(null);
    setOrbS("listening");
    setInterim("");
    const l = listenOnce(setInterim);
    stopListen.current = l.stop;
    try {
      const text = await l.done;
      setInterim("");
      if (!text) { setOrbS("idle"); return setError(STT_HELP["no-speech"]); }
      await send(text);
    } catch (err) {
      setOrbS("idle");
      const code = err as SttError;
      if (code === "denied" || code === "unsupported") setVoiceInOk(false);
      setError(STT_HELP[code] ?? STT_HELP.other);
    } finally {
      stopListen.current = null;
    }
  }

  async function send(text: string, retry = false) {
    if (!sessionId) return;
    if (!retry) setTurnsS([...turnsRef.current, { role: "seller", text }]);
    const idx = turnsRef.current.length - 1; // index of this seller turn
    setOrbS("thinking");
    try {
      const res = await converse(sessionId, idx, text);
      setTurnsS([...turnsRef.current, { role: "buyer", text: res.reply }]);
      if (res.outcome) { outcomeRef.current = res.outcome; setOutcome(res.outcome); }
      setOrbS("speaking");
      await speaker.current?.speak(res.reply);
      setOrbS("idle");
      if (!res.outcome && settings.autoListen && voiceInOk && idx + 2 < MAX_TURNS * 2) void listen();
    } catch (e) {
      setOrbS("idle");
      setError(`${(e as Error).message} Tap "Retry" to resend (you won't be charged twice).`);
      pendingRetry.current = text;
    }
  }
  const pendingRetry = useRef<string | null>(null);

  async function end() {
    if (!sessionId) return;
    if (!outcomeRef.current && turnsRef.current.length > 0 && !confirm("End the call and get coached?")) return;
    stopListen.current?.();
    speaker.current?.stop();
    const duration = Math.round((Date.now() - startedAt.current) / 1000);
    await supabase.from("sessions").update({ status: "ended", ended_at: new Date().toISOString(), duration_sec: duration }).eq("id", sessionId);
    if (turnsRef.current.some((t) => t.role === "seller")) nav(`/session/${sessionId}`);
    else { await supabase.from("sessions").delete().eq("id", sessionId); nav("/home"); }
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    const t = typed.trim();
    if (!t || orbRef.current === "thinking") return;
    setTyped("");
    void send(t);
  }

  if (phase !== "live") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-4xl">Sell me this pen</h1>
          <p className="text-mute mt-1">You're selling. {WOLF.name} is buying. {WOLF.disclosure}</p>
        </div>
        {resumable && phase === "setup" && (
          <div className="card p-4 flex items-center justify-between gap-3">
            <span className="text-sm">You have an unfinished call.</span>
            <button className="btn btn-ghost" onClick={resume}>Resume</button>
          </div>
        )}
        <fieldset className="grid gap-3">
          <legend className="text-sm text-mute mb-2">Difficulty</legend>
          {LEVELS.map((l) => (
            <label key={l.id} className={`card p-4 flex gap-3 items-center cursor-pointer ${difficulty === l.id ? "border-gold" : ""}`}>
              <input type="radio" name="diff" className="w-5 h-5 min-h-0 accent-[#d4a24c]" checked={difficulty === l.id} onChange={() => setDifficulty(l.id)} />
              <span><span className="font-semibold">{l.label}</span><span className="block text-sm text-mute">{l.desc}</span></span>
            </label>
          ))}
        </fieldset>
        {!voiceInOk && <p className="text-sm text-bad">{STT_HELP.unsupported}</p>}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <button className="btn btn-gold" onClick={start} disabled={phase === "loading"}>
          {phase === "loading" ? loadMsg || "Starting..." : "Start the call"}
        </button>
        <p className="text-xs text-mute">Your mic is only on while the status says "Listening". Audio is never saved, only the text transcript.</p>
      </div>
    );
  }

  const lastFailed = Boolean(error && pendingRetry.current);
  return (
    <div ref={live} className="flex flex-col gap-4 min-h-[70dvh]">
      <div className="flex items-center justify-between">
        <span className="text-sm text-mute capitalize">{difficulty} · {WOLF.name}</span>
        <button className="text-sm text-mute" onClick={() => { const m = !muted; setMuted(m); if (speaker.current) { speaker.current.muted = m; if (m) speaker.current.stop(); } }}>
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>

      <Orb state={orb} size={180} />
      <p role="status" aria-live="polite" className="text-center text-sm text-gold">
        {outcome === "deal" ? "Deal closed." : outcome === "no_deal" ? "He walked. No deal." : STATUS[orb]}
      </p>

      <div className="card p-4 flex-1 overflow-y-auto max-h-[38dvh] flex flex-col gap-3" aria-label="Transcript">
        {turns.length === 0 && <p className="text-mute text-sm">The Wolf: "{WOLF.opener}"</p>}
        {turns.map((t, i) => (
          <p key={i} className={t.role === "seller" ? "self-end text-right max-w-[85%]" : "max-w-[85%] text-mute"}>
            <span className="block text-xs uppercase tracking-wide opacity-60">{t.role === "seller" ? "You" : "The Wolf"}</span>
            {t.text}
          </p>
        ))}
        {interim && <p className="self-end text-right max-w-[85%] opacity-60 italic">{interim}</p>}
        <div ref={transcriptEnd} />
      </div>

      {error && (
        <div role="alert" className="text-sm text-bad flex items-center justify-between gap-3">
          <span>{error}</span>
          {lastFailed && (
            <button className="btn btn-ghost shrink-0" onClick={() => { const t = pendingRetry.current!; pendingRetry.current = null; setError(null); void send(t, true); }}>
              Retry
            </button>
          )}
        </div>
      )}

      {!voiceInOk && !outcome && (
        <form onSubmit={submitTyped} className="flex gap-2">
          <input aria-label="Type your line" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Voice unavailable. Type instead." />
          <button className="btn btn-gold">Send</button>
        </form>
      )}

      <div className="flex items-center justify-center gap-4 pt-2" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {!outcome && voiceInOk && (
          <button
            aria-label={orb === "listening" ? "Stop and send" : "Talk"}
            onClick={() => (orb === "listening" ? stopListen.current?.() : listen())}
            disabled={orb === "thinking"}
            className={`w-20 h-20 rounded-full flex items-center justify-center text-ink font-semibold transition ${orb === "listening" ? "bg-bad scale-110" : "bg-gold"}`}
          >
            {orb === "listening" ? "Send" : "Talk"}
          </button>
        )}
        <button className="btn btn-ghost" onClick={end}>{outcome ? "Get coached" : "End call"}</button>
      </div>
    </div>
  );
}
