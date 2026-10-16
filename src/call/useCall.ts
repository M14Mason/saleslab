// The call engine. Owns mic, speaker, Claude requests, persistence. UI only renders its state.
import { useCallback, useEffect, useRef, useState } from "react";
import { buyerTurn, ClaudeError, isMock } from "../lib/claude";
import { db, type Session } from "../lib/db";
import { log } from "../lib/log";
import { analyze, liveHint } from "../../shared/metrics";
import type { Turn } from "../../shared/prompts";
import { MAX_TURNS } from "../../shared/limits";
import { voiceFor, type Difficulty, type Scenario } from "../../shared/scenarios";
import { isIOS, Listener, MicMeter, sttSupported, type SttError } from "../speech/stt";
import { preloadNatural, Speaker } from "../speech/tts";
import { getEleven } from "../lib/keys";

const estimateSpeechMs = (text: string) => 1500 + text.split(/\s+/).length * 520;
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
}

export type CallState = "idle" | "buyer" | "listening" | "thinking" | "paused" | "error" | "ended";

export const STT_HELP: Record<SttError, string> = {
  denied: "Microphone blocked. iPhone: Settings > Safari > Microphone > Allow, and turn on Siri & Dictation. Chrome: click the icon left of the address bar > Microphone > Allow.",
  "no-speech": "Didn't hear anything. Tap Talk and speak up, or check your mic in Settings.",
  network: "Speech recognition needs internet. Check your connection.",
  unsupported: "This browser can't transcribe speech. Use Chrome or Edge on a computer, or Safari on iPhone. You can type instead.",
  "audio-capture": "No microphone found. Plug one in or check your system sound settings.",
  other: "Mic hiccup. Tap Talk to try again.",
};

export type CallSetup = {
  scenario: Scenario; difficulty: Difficulty; mode: "practice" | "assessment";
  liveCoaching: boolean; surprise: boolean; timeLimitSec: number | null;
};

export function useCall() {
  const settings = db.settings();
  const [state, setStateRaw] = useState<CallState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState("");
  const [streaming, setStreaming] = useState("");   // buyer text as it arrives
  const [error, setError] = useState<{ message: string; retry: "buyer" | "listen" | null } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"deal" | "no_deal" | null>(null);
  const [level, setLevel] = useState(0);
  const [thinkingSince, setThinkingSince] = useState<number | null>(null);
  const [voiceIn, setVoiceIn] = useState(sttSupported());
  const [muted, setMuted] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [micWarning, setMicWarning] = useState<string | null>(null);

  // Refs are the source of truth inside async callbacks (no stale closures).
  const st = useRef<CallState>("idle");
  const turnsRef = useRef<Turn[]>([]);
  const setup = useRef<CallSetup | null>(null);
  const sessionId = useRef<string | null>(null);
  const startedAt = useRef(0);
  const speaker = useRef<Speaker | null>(null);
  const listener = useRef<Listener | null>(null);
  const meter = useRef<MicMeter | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const finalAt = useRef(0);
  const voiceOk = useRef(voiceIn);
  const outcomeRef = useRef<"deal" | "no_deal" | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingRef = useRef(false);
  const timeUp = useRef(false);

  const setState = (s: CallState) => { st.current = s; setStateRaw(s); };

  const persist = useCallback((fn: (s: Session) => void) => {
    if (sessionId.current) db.patchSession(sessionId.current, fn);
  }, []);

  const setTurnsBoth = (t: Turn[]) => {
    turnsRef.current = t;
    setTurns(t);
    persist((s) => { s.turns = t; s.durationSec = Math.round((Date.now() - startedAt.current) / 1000); });
  };

  const stopMeter = () => { meter.current?.stop(); meter.current = null; setLevel(0); };

  // ---------------- listening ----------------
  const listen = useCallback((auto = false) => {
    if (["listening", "thinking", "ended"].includes(st.current) || outcomeRef.current || timeUp.current) return;
    if (!voiceOk.current || (auto && typingRef.current)) { setState("idle"); return; } // typing mode: no mic
    speaker.current?.stop();
    setError(null);
    setInterim("");
    setState("listening");
    const l = new Listener({
      pauseMs: db.settings().pauseMs,
      onInterim: (t) => setInterim(t),
      onFinal: (text) => { stopMeter(); setInterim(""); finalAt.current = performance.now(); void submitSeller(text); },
      onError: (code) => {
        stopMeter();
        setInterim("");
        if (st.current === "listening") setState("idle");
        // iPhone blocks a mic that starts without a tap. Not a real denial.
        if (auto && (code === "denied" || code === "other")) { setError({ message: "Tap Talk to answer.", retry: "listen" }); return; }
        if (code === "denied" || code === "unsupported") { voiceOk.current = false; setVoiceIn(false); }
        setError({ message: STT_HELP[code], retry: code === "denied" || code === "unsupported" ? null : "listen" });
      },
    });
    listener.current = l;
    l.start();
    // Live input meter (skipped on iPhone, where a second mic stream can break recognition).
    if (!isIOS()) {
      const m = new MicMeter((v) => setLevel(v));
      meter.current = m;
      void m.start(db.settings().micDeviceId).then((status) => {
        if (status === "silent") setMicWarning("Your mic looks muted. Check the mute switch or system settings.");
      });
      setTimeout(() => {
        if (meter.current !== m || st.current !== "listening") return;
        const a = m.assess();
        setMicWarning(a === "silent" ? "No sound from your mic. Is it muted or the wrong device?" : a === "quiet" ? "Your mic is very quiet. Move closer or raise input volume." : null);
      }, 4000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- buyer turn ----------------
  const requestBuyer = useCallback(async () => {
    const cfg = setup.current!;
    const at = turnsRef.current;
    if (at.at(-1)?.role !== "seller") return;          // nothing to answer: prevents duplicate replies
    if (timeUp.current) return;
    if (inflight.current) return;                        // single flight
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setState("thinking");
    setThinkingSince(Date.now());
    setStreaming("");
    const sp = speaker.current!;
    sp.firstAudioAt = null;
    let got = "";
    try {
      const sellerCount = at.filter((t) => t.role === "seller").length;
      const res = await buyerTurn({
        scenario: cfg.scenario, difficulty: cfg.difficulty, turns: at, brain: db.settings().brain,
        surprise: cfg.surprise && sellerCount >= 2,
        signal: ctrl.signal,
        onText: (d) => {
          got += d;
          setStreaming(got.replace(/\[(NO_)?DEAL\]/g, ""));
          if (st.current === "thinking") setState("buyer");
          sp.push(d);
        },
        onDiscard: () => { got = ""; sp.stop(); setStreaming(""); },
      });
      if (ctrl.signal.aborted) return;
      // Append exactly once, only if the conversation hasn't moved on.
      if (turnsRef.current.at(-1)?.role === "seller") {
        setTurnsBoth([...turnsRef.current, { role: "buyer", text: res.reply, at: Date.now() - startedAt.current }]);
      }
      setStreaming("");
      persist((s) => { s.perf.firstTokenMs.push(Math.round(res.firstTokenMs)); });
      if (res.outcome) { outcomeRef.current = res.outcome; setOutcome(res.outcome); persist((s) => { s.outcome = res.outcome; }); }
      setState("buyer");
      setThinkingSince(null);
      // The reply text is complete: release the request lock BEFORE speaking, so a stuck
      // audio device can never block your next turn (old bug: voice and typing both stopped sending).
      if (inflight.current === ctrl) inflight.current = null;
      await withTimeout(sp.flush(), estimateSpeechMs(res.reply) + 4000);
      if (sp.firstAudioAt && finalAt.current) {
        const ms = Math.round(sp.firstAudioAt - finalAt.current);
        persist((s) => { s.perf.firstAudioMs.push(ms); });
        log("first_audio", { ms });
      }
      if (ctrl.signal.aborted || st.current !== "buyer") return;
      setState("idle");
      if (!outcomeRef.current && db.settings().autoListen && voiceOk.current && !typingRef.current) {
        const sellerTurns = turnsRef.current.filter((t) => t.role === "seller").length;
        if (sellerTurns < MAX_TURNS) listen(true);
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      sp.stop();
      setStreaming("");
      setThinkingSince(null);
      setState("error");
      const msg = e instanceof ClaudeError ? e.message : "Something went wrong. Tap Retry.";
      setError({ message: msg, retry: e instanceof ClaudeError && e.kind === "auth" ? null : "buyer" });
    } finally {
      if (inflight.current === ctrl) inflight.current = null;
    }
  }, [listen, persist]);

  const submitSeller = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || !setup.current) return;
    if (outcomeRef.current) { setError({ message: "The call is over. Tap Get coached for your report.", retry: null }); return; }
    // Talking or typing while the buyer is mid-reply counts as interrupting them, never a silent drop.
    if (inflight.current) { inflight.current.abort(); inflight.current = null; }
    if (st.current === "buyer" || st.current === "thinking") {
      speaker.current?.stop(); setStreaming(""); setThinkingSince(null);
      const last = turnsRef.current.at(-1);
      if (last?.role === "buyer") setTurnsBoth([...turnsRef.current.slice(0, -1), { ...last, interrupted: true }]);
    }
    setError(null);
    const prev = turnsRef.current;
    // Same line again right after a failed reply: that's a retry, not a new turn (old bug: it was silently ignored).
    if (prev.at(-1)?.role === "seller" && prev.at(-1)?.text.trim().toLowerCase() === t.toLowerCase()) { await requestBuyer(); return; }
    if (prev.filter((x) => x.role === "seller").length >= MAX_TURNS) {
      setError({ message: "Turn limit reached. End the call to get coached.", retry: null });
      return;
    }
    const next: Turn[] = [...prev, { role: "seller", text: t, at: Date.now() - startedAt.current }];
    setTurnsBoth(next);
    const c = setup.current;
    if (c.mode === "practice" && c.liveCoaching) setHint(liveHint(next));
    if (timeUp.current) { setState("idle"); return; } // time's up: keep your last line, no new reply
    await requestBuyer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestBuyer]);

  // ---------------- lifecycle ----------------
  const start = useCallback(async (cfg: CallSetup, resume?: Session) => {
    setup.current = cfg;
    const s = db.settings();
    preloadNatural(s.voiceEngine);
    speaker.current?.dispose();
    const v = voiceFor(cfg.scenario.persona);
    speaker.current = new Speaker({
      engine: s.voiceEngine, voice: v.natural, speed: s.speed, gender: cfg.scenario.persona.gender,
      pitch: v.pitch, rate: v.rate, detune: v.detune, depth: s.voiceDepth, seed: cfg.scenario.persona.name,
      custom: cfg.scenario.id === "wolf-pen" ? getEleven() : null,
    }, {
      onLevel: (v) => { if (st.current === "buyer") setLevel(v); },
    });
    speaker.current.unlock(); // must run inside the tap that started the call
    setError(null); setHint(null); setOutcome(null); outcomeRef.current = null; timeUp.current = false;

    if (resume) {
      sessionId.current = resume.id;
      startedAt.current = Date.now() - resume.durationSec * 1000;
      turnsRef.current = resume.turns; setTurns(resume.turns);
      setState("idle");
      if (resume.turns.at(-1)?.role === "seller") void requestBuyer();
      else listen();
    } else {
      const id = crypto.randomUUID();
      sessionId.current = id;
      startedAt.current = Date.now();
      turnsRef.current = []; setTurns([]);
      db.upsertSession({
        id, scenarioId: cfg.scenario.id, scenario: cfg.scenario, difficulty: cfg.difficulty, mode: cfg.mode,
        liveCoaching: cfg.liveCoaching, surprise: cfg.surprise, timeLimitSec: cfg.timeLimitSec,
        status: "active", outcome: null, turns: [], startedAt: new Date().toISOString(), endedAt: null, durationSec: 0,
        grading: { status: "idle", error: null, attempts: 0, ms: null }, report: null, metrics: null,
        perf: { firstAudioMs: [], firstTokenMs: [] }, demo: isMock(),
      });
      setState("buyer");
      await speaker.current.say(cfg.scenario.opener);
      if (st.current !== "buyer") return;
      setState("idle");
      if (s.autoListen && voiceOk.current && !typingRef.current) listen(true);
    }
    if (cfg.timeLimitSec) {
      const endAt = startedAt.current + cfg.timeLimitSec * 1000;
      timer.current = setInterval(() => {
        const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
        setRemaining(left);
        if (left === 0 && timer.current) {
          clearInterval(timer.current); timer.current = null;
          timeUp.current = true;
          inflight.current?.abort(); inflight.current = null;
          speaker.current?.stop();
          listener.current?.finish();
          setStreaming(""); setThinkingSince(null);
          if (st.current !== "listening") setState("idle");
          setError({ message: "Time's up. End the call to get coached.", retry: null });
        }
      }, 500);
    }
  }, [listen, requestBuyer]);

  /** Tap while the buyer is talking: stop them and take the floor. */
  const interrupt = useCallback(() => {
    if (st.current !== "buyer" && st.current !== "thinking") return;
    inflight.current?.abort();
    inflight.current = null;
    speaker.current?.stop();
    // Keep what the buyer had said so far, marked as cut off.
    const partial = streaming.trim();
    const last = turnsRef.current.at(-1);
    if (last?.role === "buyer") setTurnsBoth([...turnsRef.current.slice(0, -1), { ...last, interrupted: true }]);
    else if (partial) setTurnsBoth([...turnsRef.current, { role: "buyer", text: partial, at: Date.now() - startedAt.current, interrupted: true }]);
    setStreaming("");
    setThinkingSince(null);
    setState("idle");
    listen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen, streaming]);

  const sendNow = useCallback(() => listener.current?.finish(), []);
  const reRecord = useCallback(() => { listener.current?.cancel(); stopMeter(); setInterim(""); setState("idle"); listen(); }, [listen]);
  const retry = useCallback(() => {
    const r = error?.retry;
    setError(null);
    if (r === "buyer") void requestBuyer();
    else if (r === "listen") listen();
  }, [error, listen, requestBuyer]);

  const pause = useCallback(() => {
    listener.current?.cancel(); stopMeter();
    inflight.current?.abort(); inflight.current = null;
    speaker.current?.stop();
    setInterim(""); setStreaming(""); setThinkingSince(null);
    setState("paused");
  }, []);
  const resume = useCallback(() => {
    setState("idle");
    if (turnsRef.current.at(-1)?.role === "seller") void requestBuyer(); else listen();
  }, [listen, requestBuyer]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (speaker.current) { speaker.current.muted = next; if (next) speaker.current.stop(); }
      return next;
    });
  }, []);

  const end = useCallback((): string | null => {
    listener.current?.cancel(); stopMeter();
    inflight.current?.abort(); inflight.current = null;
    speaker.current?.stop();
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setState("ended");
    const id = sessionId.current;
    if (!id) return null;
    const durationSec = Math.round((Date.now() - startedAt.current) / 1000);
    const hasSeller = turnsRef.current.some((t) => t.role === "seller");
    if (!hasSeller) { db.deleteSession(id); return null; }
    persist((s) => {
      s.status = "ended"; s.endedAt = new Date().toISOString(); s.durationSec = durationSec;
      s.metrics = analyze(s.turns, durationSec);
    });
    return id;
  }, [persist]);

  // Phones stop the mic when the app is hidden. Pause cleanly instead of failing.
  useEffect(() => {
    const h = () => { if (document.hidden && ["listening", "buyer", "thinking"].includes(st.current)) pause(); };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [pause]);

  // Full cleanup on unmount: mic, audio, timers, requests.
  useEffect(() => () => {
    listener.current?.cancel();
    meter.current?.stop();
    inflight.current?.abort();
    speaker.current?.dispose();
    if (timer.current) clearInterval(timer.current);
  }, []);

  return {
    state, turns, interim, streaming, error, hint, outcome, level, thinkingSince, voiceIn, muted, remaining, micWarning,
    start, listen, submitText: submitSeller, interrupt, sendNow, reRecord, retry, pause, resume, toggleMute, end,
    dismissHint: () => setHint(null), dismissMicWarning: () => setMicWarning(null),
    setTyping: (v: boolean) => { typingRef.current = v; if (v && st.current === "listening") { listener.current?.cancel(); stopMeter(); setInterim(""); setState("idle"); } },
    timeUp: () => timeUp.current,
    sessionId: () => sessionId.current,
    settings,
  };
}
