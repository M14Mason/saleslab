// Text-to-speech with a sentence queue so the buyer starts talking while Claude is still writing.
// Root cause of the 45-second delay: the old code downloaded the ~80 MB natural voice model
// BEFORE the call could start, then generated the whole reply before playing anything.
// Now the system voice speaks instantly; the natural voice loads in the background and takes
// over only once it's ready and proven fast enough on this device.

export type VoiceId = "am_fenrir" | "am_michael" | "am_puck" | "am_eric";
export const VOICES: { id: VoiceId; label: string }[] = [
  { id: "am_fenrir", label: "Gravel" },
  { id: "am_michael", label: "Smooth" },
  { id: "am_puck", label: "Fast and sharp" },
  { id: "am_eric", label: "Boardroom" },
];

export type Engine = "natural" | "system";
type Pending = { resolve: (a: { audio: Float32Array; rate: number }) => void; reject: (e: Error) => void };

/** Splits streamed text into speakable sentences. Exported for tests. */
export function takeSentences(buffer: string, final = false): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  const re = /^([\s\S]*?[.!?]+["')\]]?)(\s+|$)/;
  for (;;) {
    const m = rest.match(re);
    if (!m || (!m[2] && !final)) break;           // need trailing space to be sure the sentence ended
    const s = m[1].trim();
    if (s.length < 3 && !final) break;            // "Mr." style fragments: wait for more
    if (s) sentences.push(s);
    rest = rest.slice(m[0].length);
    if (!rest) break;
  }
  if (final && rest.trim()) { sentences.push(rest.trim()); rest = ""; }
  return { sentences, rest };
}

class NaturalVoice {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private id = 0;
  ready = false;
  failed = false;
  private loading: Promise<boolean> | null = null;

  load(): Promise<boolean> {
    if (this.loading) return this.loading;
    this.loading = new Promise<boolean>((resolve) => {
      try {
        this.worker = new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });
      } catch { this.failed = true; resolve(false); return; }
      const t = setTimeout(() => { this.failed = true; resolve(false); }, 180_000);
      this.worker.onmessage = (e) => {
        const d = e.data as { type: string; id: number; audio?: Float32Array; rate?: number; message?: string };
        if (d.type === "ready") { clearTimeout(t); this.ready = true; resolve(true); return; }
        if (d.type === "error" && d.id === -1) { clearTimeout(t); this.failed = true; resolve(false); return; }
        const p = this.pending.get(d.id);
        if (!p) return;
        this.pending.delete(d.id);
        if (d.type === "audio") p.resolve({ audio: d.audio!, rate: d.rate! }); else p.reject(new Error(d.message));
      };
      this.worker.onerror = () => { clearTimeout(t); this.failed = true; resolve(false); };
      this.worker.postMessage({ type: "load" });
    });
    return this.loading;
  }

  generate(text: string, voice: string, speed: number): Promise<{ audio: Float32Array; rate: number }> {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: "speak", id, text, voice, speed });
    });
  }

  dispose() { this.worker?.terminate(); this.worker = null; this.ready = false; this.loading = null; }
}

// One natural-voice model per page load, shared across calls.
const natural = new NaturalVoice();

/** Auto mode only uses the natural voice where it's fast: a computer with WebGPU and enough memory. */
export function canUseNatural(): boolean {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const gpu = "gpu" in navigator;
  return typeof Worker !== "undefined" && mem >= 4 && !mobile && gpu;
}

/** Starts the background download of the natural voice (never blocks a call). */
export function preloadNatural(engine: "auto" | "natural" | "system") {
  if (engine === "system") return;
  if (engine === "auto" && !canUseNatural()) return;
  void natural.load();
}
export const naturalStatus = () => (natural.ready ? "ready" : natural.failed ? "failed" : "loading");

// One shared AudioContext, unlocked by the tap that starts a call (iOS requires a user gesture).
let sharedCtx: AudioContext | null = null;
function ctxOrNew(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new AC();
  }
  return sharedCtx;
}

/** Call synchronously inside a click/tap handler before starting a call. */
export function unlockAudio() {
  try {
    const c = ctxOrNew();
    if (c.state === "suspended") void c.resume();
    // Play one silent sample: the most reliable unlock on iOS Safari.
    const b = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = b; src.connect(c.destination); src.start(0);
  } catch { /* no Web Audio */ }
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

export type SpeakerEvents = {
  onSpeaking?: (speaking: boolean) => void;
  onLevel?: (level: number) => void;
};

export class Speaker {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer = "";
  private queue: Promise<void> = Promise.resolve();
  private gen = 0;                      // bumps on stop(): late audio from old turns is ignored
  private active = 0;                   // queued + playing sentences
  private naturalTooSlow = false;
  private raf = 0;
  muted = false;
  engineUsed: Engine = "system";
  firstAudioAt: number | null = null;

  constructor(
    private opts: { engine: "auto" | "natural" | "system"; voice: string; speed: number; sinkId?: string | null },
    private ev: SpeakerEvents = {},
  ) {}

  /** Call inside a tap handler: iOS only allows audio after a user gesture. */
  unlock() {
    if (!this.ctx) {
      this.ctx = ctxOrNew();
      const sink = this.opts.sinkId;
      const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      if (sink && c.setSinkId) void c.setSinkId(sink).catch(() => {});
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setOptions(p: Partial<{ voice: string; speed: number }>) { Object.assign(this.opts, p); }

  private useNatural() {
    if (this.naturalTooSlow || !natural.ready) return false;
    return this.opts.engine === "natural" || (this.opts.engine === "auto" && canUseNatural());
  }

  /** Feed streamed text. Complete sentences start speaking immediately. */
  push(delta: string) {
    this.buffer += delta;
    const { sentences, rest } = takeSentences(this.buffer);
    this.buffer = rest;
    sentences.forEach((s) => this.enqueue(s));
  }

  /** End of the reply: speak any remainder. Resolves when everything has been spoken (or stopped). */
  flush(): Promise<void> {
    const { sentences } = takeSentences(this.buffer, true);
    this.buffer = "";
    sentences.forEach((s) => this.enqueue(s));
    return this.queue;
  }

  /** Speak a full line (e.g. the opener). */
  say(text: string): Promise<void> { this.push(text); return this.flush(); }

  private enqueue(raw: string) {
    const text = raw.replace(/\[(NO_)?DEAL\]/g, "").replace(/[*_#`]/g, "").trim();
    if (!text || this.muted) return;
    const g = this.gen;
    this.active++;
    // Generate natural audio immediately (in parallel with whatever is playing), play in order.
    const audioP = this.useNatural()
      ? this.timed(natural.generate(text, this.opts.voice, this.opts.speed), this.firstAudioAt === null ? 2500 : 5000).catch(() => null)
      : Promise.resolve(null);
    this.queue = this.queue.then(async () => {
      if (g !== this.gen) return;
      this.ev.onSpeaking?.(true);
      const a = await audioP;
      if (g !== this.gen) return;
      this.firstAudioAt ??= performance.now();
      if (a) { this.engineUsed = "natural"; await this.playBuffer(a.audio, a.rate, g); }
      else { this.engineUsed = "system"; await this.systemSpeak(text, g); }
    }).finally(() => {
      if (g !== this.gen) return; // stop() already reset the count
      this.active--;
      if (this.active === 0) this.ev.onSpeaking?.(false);
    });
  }

  private timed<T>(p: Promise<T>, ms: number): Promise<T> {
    const start = performance.now();
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => { this.naturalTooSlow = true; reject(new Error("slow")); }, ms);
      p.then((v) => {
        clearTimeout(t);
        // If this device needs >3.5s per sentence, the natural voice would stall the call: switch off.
        if (performance.now() - start > 3500) this.naturalTooSlow = true;
        resolve(v);
      }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  private playBuffer(audio: Float32Array, rate: number, g: number): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve();
    if (ctx.state === "suspended") void ctx.resume();
    const buf = ctx.createBuffer(1, audio.length, rate);
    buf.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    this.analyser ??= ctx.createAnalyser();
    src.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.source = src;
    this.pumpLevel();
    return new Promise((resolve) => {
      src.onended = () => { cancelAnimationFrame(this.raf); this.ev.onLevel?.(0); resolve(); };
      if (g !== this.gen) { resolve(); return; }
      src.start();
    });
  }

  private pumpLevel() {
    const an = this.analyser;
    if (!an || !this.ev.onLevel) return;
    const data = new Uint8Array(an.frequencyBinCount);
    const tick = () => {
      an.getByteTimeDomainData(data);
      let max = 0;
      for (const v of data) max = Math.max(max, Math.abs(v - 128));
      this.ev.onLevel?.(max / 128);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  private systemSpeak(text: string, g: number): Promise<void> {
    if (!("speechSynthesis" in window)) return Promise.resolve();
    return new Promise((resolve) => {
      if (g !== this.gen) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
      u.voice =
        voices.find((v) => /(daniel|alex|aaron|arthur|fred|david|guy|male)/i.test(v.name) && v.localService) ??
        voices.find((v) => /(daniel|alex|aaron|arthur|fred|david|guy|male)/i.test(v.name)) ??
        voices.find((v) => v.default) ?? voices[0] ?? null;
      u.rate = Math.min(1.5, Math.max(0.7, this.opts.speed));
      u.pitch = 0.9;
      // Fake level so visuals still pulse (system voices expose no audio data).
      let pulse = 0;
      const iv = setInterval(() => this.ev.onLevel?.(0.25 + 0.35 * Math.abs(Math.sin((pulse += 0.6)))), 90);
      // Safety: some browsers never fire onend. Estimate duration and resolve anyway.
      const est = setTimeout(done, 1500 + text.split(/\s+/).length * 450 / u.rate);
      function done() { clearInterval(iv); clearTimeout(est); resolve(); }
      u.onend = u.onerror = () => { this.ev.onLevel?.(0); done(); };
      speechSynthesis.speak(u);
    });
  }

  /** Stop everything now (barge-in, end call, mute). */
  stop() {
    this.gen++;
    this.buffer = "";
    this.queue = Promise.resolve();
    this.active = 0;
    try { this.source?.stop(); } catch { /* not started */ }
    cancelAnimationFrame(this.raf);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.ev.onLevel?.(0);
    this.ev.onSpeaking?.(false);
  }

  get speaking() { return this.active > 0; }

  dispose() {
    this.stop();
    this.analyser?.disconnect();
    this.analyser = null;
    this.ctx = null; // shared context stays open for the next call
  }
}
