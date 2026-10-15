// Speech-to-text with real turn-taking.
// Root cause of "the AI cuts me off": the old code used continuous=false, so the browser ended
// your turn at the first short pause. Now recognition runs continuously and YOUR turn ends only
// after `pauseMs` of silence (adjustable), or when you tap Send.

type Alt = { transcript: string };
type ResultList = ArrayLike<ArrayLike<Alt> & { isFinal: boolean }>;
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

export type SttError = "denied" | "no-speech" | "network" | "unsupported" | "audio-capture" | "other";

const Ctor = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, new () => Rec>;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};
export const sttSupported = () => Boolean(Ctor());
export const isIOS = () => typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);

export type ListenerOptions = {
  pauseMs: number;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: SttError) => void;
  /** Max time to wait for the first word before giving up. */
  noSpeechMs?: number;
  /** Hard cap on one turn. */
  maxTurnMs?: number;
};

export class Listener {
  private rec: Rec | null = null;
  private committed = "";        // text from earlier recognition sessions (browser auto-restarts)
  private sessionText = "";
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private noSpeechTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private finished = false;
  private restarts = 0;
  private heardAnything = false;

  constructor(private o: ListenerOptions) {}

  get text() { return `${this.committed} ${this.sessionText}`.replace(/\s+/g, " ").trim(); }
  get isActive() { return this.active; }

  start() {
    const C = Ctor();
    if (!C) { this.o.onError("unsupported"); return; }
    this.active = true; this.finished = false; this.committed = ""; this.sessionText = ""; this.restarts = 0; this.heardAnything = false;
    this.noSpeechTimer = setTimeout(() => { if (!this.heardAnything) this.fail("no-speech"); }, this.o.noSpeechMs ?? 15_000);
    this.maxTimer = setTimeout(() => this.finish(), this.o.maxTurnMs ?? 120_000);
    this.spawn(C);
  }

  private spawn(C: new () => Rec) {
    const rec = new C();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let finals = "", interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += ` ${r[0].transcript}`; else interim += ` ${r[0].transcript}`;
      }
      this.sessionText = `${finals} ${interim}`.trim();
      if (this.text) { this.heardAnything = true; this.o.onInterim(this.text); }
      // Mid-sentence (still interim, no ending punctuation): allow a slightly longer pause.
      const extra = interim.trim() && !/[.!?]$/.test(interim.trim()) ? 500 : 0;
      this.armSilence(this.o.pauseMs + extra);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // handled by our own timers / onend
      const map: Record<string, SttError> = { "not-allowed": "denied", "service-not-allowed": "denied", network: "network", "audio-capture": "audio-capture" };
      this.fail(map[e.error] ?? "other");
    };
    rec.onend = () => {
      if (!this.active || this.finished) return;
      // Browsers end recognition on their own (silence, ~60s cap). Keep the words and continue.
      this.committed = this.text; this.sessionText = "";
      if (this.restarts++ > 20) { this.finish(); return; }
      try { this.spawn(C); } catch { this.finish(); }
    };
    this.rec = rec;
    try { rec.start(); } catch { this.fail("other"); }
  }

  private armSilence(ms: number) {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.finish(), ms);
  }

  /** End the turn now (Send button / silence). */
  finish() {
    if (!this.active || this.finished) return;
    this.finished = true;
    const text = this.text;
    this.teardown();
    if (text) this.o.onFinal(text); else this.o.onError("no-speech");
  }

  /** Throw away this turn (Re-record / Cancel). */
  cancel() {
    if (!this.active) return;
    this.finished = true;
    this.teardown();
  }

  private fail(code: SttError) {
    if (this.finished) return;
    this.finished = true;
    this.teardown();
    this.o.onError(code);
  }

  private teardown() {
    this.active = false;
    for (const t of [this.silenceTimer, this.noSpeechTimer, this.maxTimer]) if (t) clearTimeout(t);
    this.silenceTimer = this.noSpeechTimer = this.maxTimer = null;
    const r = this.rec; this.rec = null;
    if (r) { r.onresult = r.onerror = r.onend = null; try { r.abort(); } catch { /* already stopped */ } }
  }
}

// ---------------- Mic level meter ----------------

export type MicStatus = "ok" | "quiet" | "silent" | "denied" | "missing" | "error";

/** Live input level from the selected microphone (with echo cancellation + noise suppression). */
export class MicMeter {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;
  private peak = 0;
  private started = 0;

  constructor(private onLevel: (level: number) => void) {}

  async start(deviceId?: string | null): Promise<MicStatus> {
    if (!navigator.mediaDevices?.getUserMedia) return "missing";
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
        },
      });
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === "NotAllowedError" || name === "SecurityError") return "denied";
      if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
      return "error";
    }
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    const an = this.ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    this.started = performance.now();
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const level = Math.min(1, rms * 6);
      this.peak = Math.max(this.peak * 0.995, level);
      this.onLevel(level);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
    const track = this.stream.getAudioTracks()[0];
    if (track?.muted) return "silent";
    return "ok";
  }

  /** After a few seconds: is the input too quiet to transcribe well? */
  assess(): MicStatus {
    if (!this.stream) return "missing";
    if (performance.now() - this.started < 2000) return "ok";
    if (this.peak < 0.02) return "silent";
    if (this.peak < 0.08) return "quiet";
    return "ok";
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.stream = null; this.ctx = null;
  }
}

export async function listMics(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  } catch {
    return [];
  }
}
