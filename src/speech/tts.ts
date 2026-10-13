// Free voice output. Kokoro (open-source model, runs on-device in a worker) with the
// browser's built-in voice as a fallback. Nothing here costs money.

export type VoiceId = "am_fenrir" | "am_michael" | "am_puck" | "am_eric";
export const VOICES: { id: VoiceId; label: string }[] = [
  { id: "am_fenrir", label: "Gravel (default)" },
  { id: "am_michael", label: "Smooth" },
  { id: "am_puck", label: "Fast and sharp" },
  { id: "am_eric", label: "Boardroom" },
];

type Engine = "kokoro" | "browser";

export class Speaker {
  private worker: Worker | null = null;
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private pending = new Map<number, { resolve: (a: { audio: Float32Array; rate: number }) => void; reject: (e: Error) => void }>();
  private nextId = 0;
  engine: Engine = "browser";
  muted = false;

  constructor(private voice: VoiceId = "am_fenrir", private speed = 1.12) {}

  /** Must be called from a tap/click so iOS allows audio. */
  unlock() {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    // Prime speechSynthesis on iOS as well.
    if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }

  /** Loads Kokoro (~80 MB first time, cached after). Falls back to browser voice on failure. */
  async load(onProgress?: (s: string) => void): Promise<Engine> {
    const lowMemory = ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) < 3;
    if (lowMemory || typeof Worker === "undefined") return (this.engine = "browser");
    onProgress?.("Loading the Wolf's voice (first time only)...");
    try {
      this.worker = new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e) => this.onWorker(e.data);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 120_000);
        const h = (e: MessageEvent) => {
          if (e.data.type === "ready") { clearTimeout(t); this.worker?.removeEventListener("message", h); resolve(); }
          if (e.data.type === "error") { clearTimeout(t); reject(new Error(e.data.message)); }
        };
        this.worker!.addEventListener("message", h);
        this.worker!.postMessage({ type: "load" });
      });
      return (this.engine = "kokoro");
    } catch {
      this.worker?.terminate();
      this.worker = null;
      return (this.engine = "browser");
    }
  }

  private onWorker(d: { type: string; id: number; audio?: Float32Array; rate?: number; message?: string }) {
    const p = this.pending.get(d.id);
    if (!p) return;
    this.pending.delete(d.id);
    if (d.type === "audio") p.resolve({ audio: d.audio!, rate: d.rate! });
    else if (d.type === "error") p.reject(new Error(d.message));
  }

  async speak(text: string): Promise<void> {
    if (this.muted || !text) return;
    if (this.engine === "kokoro" && this.worker && this.ctx) {
      try {
        const id = this.nextId++;
        const { audio, rate } = await new Promise<{ audio: Float32Array; rate: number }>((resolve, reject) => {
          this.pending.set(id, { resolve, reject });
          this.worker!.postMessage({ type: "speak", id, text, voice: this.voice, speed: this.speed });
        });
        return await this.play(audio, rate);
      } catch {
        // fall through to browser voice for this line
      }
    }
    return this.browserSpeak(text);
  }

  private play(audio: Float32Array, rate: number): Promise<void> {
    const ctx = this.ctx!;
    if (ctx.state === "suspended") void ctx.resume();
    const buf = ctx.createBuffer(1, audio.length, rate);
    buf.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    this.source = src;
    return new Promise((resolve) => {
      src.onended = () => resolve();
      src.start();
    });
  }

  private browserSpeak(text: string): Promise<void> {
    if (!("speechSynthesis" in window)) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
      u.voice = voices.find((v) => /male|daniel|alex|fred|david/i.test(v.name)) ?? voices[0] ?? null;
      u.rate = 1.1;
      u.pitch = 0.85;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }

  stop() {
    try { this.source?.stop(); } catch { /* already stopped */ }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  dispose() {
    this.stop();
    this.worker?.terminate();
    void this.ctx?.close();
  }
}
