import { useEffect, useRef, useState } from "react";
import { db, useData } from "../lib/db";
import { isIOS, listMics, Listener, MicMeter, sttSupported, type MicStatus } from "../speech/stt";
import { Speaker } from "../speech/tts";
import Waveform from "./Waveform";

const STATUS_TEXT: Record<MicStatus, string> = {
  ok: "Sounds good.",
  quiet: "Very quiet. Move closer to the mic or raise the input volume in your system settings.",
  silent: "No sound detected. Check that your mic isn't muted and the right device is selected.",
  denied: "Mic access is blocked. Allow the microphone for this site in your browser settings, then try again.",
  missing: "No microphone found.",
  error: "Couldn't open the mic. Close other apps using it and try again.",
};

/** Mic check: device picker, live level, speech-to-text check, and a speaker test. */
export default function MicTest() {
  const { settings } = useData();
  const [level, setLevel] = useState(0);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<MicStatus | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [heard, setHeard] = useState("");
  const [sttState, setSttState] = useState<"idle" | "listening" | "done" | "error">("idle");
  const meter = useRef<MicMeter | null>(null);
  const listener = useRef<Listener | null>(null);
  const check = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    stop();
    const m = new MicMeter(setLevel);
    meter.current = m;
    setRunning(true);
    const st = await m.start(settings.micDeviceId);
    setStatus(st);
    if (st === "ok" || st === "silent") {
      setMics(await listMics());  // labels are only available after permission
      check.current = setInterval(() => setStatus(m.assess()), 1500);
    } else setRunning(false);
  }

  function stop() {
    meter.current?.stop(); meter.current = null;
    if (check.current) clearInterval(check.current);
    setRunning(false); setLevel(0);
  }

  function testStt() {
    if (isIOS()) stop(); // iPhone can't run the meter and recognition together
    setHeard(""); setSttState("listening");
    const l = new Listener({
      pauseMs: settings.pauseMs, noSpeechMs: 8000,
      onInterim: setHeard,
      onFinal: (t) => { setHeard(t); setSttState("done"); },
      onError: () => setSttState("error"),
    });
    listener.current = l;
    l.start();
  }

  function testSpeaker() {
    const sp = new Speaker({ engine: settings.voiceEngine, voice: settings.voice, speed: settings.speed });
    sp.unlock();
    void sp.say("Alright, kid. Here's the pen. Sell me this pen.").then(() => setTimeout(() => sp.dispose(), 300));
  }

  useEffect(() => () => { stop(); listener.current?.cancel(); }, []);

  return (
    <div className="panel p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <span className="font-semibold">Microphone</span>
        <button className="btn btn-quiet btn-sm" onClick={running ? stop : start}>{running ? "Stop test" : "Test mic"}</button>
      </div>
      <div className="inset px-2" aria-live="polite">
        <Waveform level={level} who={running ? "you" : "idle"} active={running} height={72} />
        <div className="sr-only">Input level {Math.round(level * 100)} percent</div>
      </div>
      {status && <p role="status" className={status === "ok" ? "text-good" : "text-bad"}>{STATUS_TEXT[status]}</p>}
      {mics.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-mute">Input device</span>
          <select className="field" value={settings.micDeviceId ?? ""} onChange={(e) => { db.setSettings({ micDeviceId: e.target.value || null }); void start(); }}>
            <option value="">System default</option>
            {mics.map((m, i) => <option key={m.deviceId || i} value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>)}
          </select>
          <span className="text-xs text-mute">Speech recognition in Chrome and Safari always uses your system default mic. To use another mic on calls, set it as the default in your computer's sound settings.</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {sttSupported() && <button className="btn btn-quiet btn-sm" onClick={testStt} disabled={sttState === "listening"}>{sttState === "listening" ? "Listening..." : "Test transcription"}</button>}
        <button className="btn btn-quiet btn-sm" onClick={testSpeaker}>Test speaker</button>
      </div>
      {sttState !== "idle" && (
        <p className="text-sm" aria-live="polite">
          {sttState === "error" ? <span className="text-bad">Didn't catch anything. Check the mic and try again.</span>
            : <>Heard: <span className="text-you">{heard || "..."}</span></>}
        </p>
      )}
      {!sttSupported() && <p className="text-sm text-bad">This browser can't transcribe speech. Use Chrome or Edge, or Safari on iPhone. You can still type on calls.</p>}
    </div>
  );
}
