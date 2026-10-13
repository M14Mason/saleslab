// Free speech-to-text using the browser's built-in recognizer.
// Chrome/Edge on Windows: good. iPhone Safari: works, can be flaky; needs Siri enabled.

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function sttSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export type SttError = "denied" | "no-speech" | "network" | "unsupported" | "other";

export function listenOnce(onInterim: (t: string) => void): { done: Promise<string>; stop: () => void } {
  const w = window as unknown as Record<string, new () => Rec>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return { done: Promise.reject<string>("unsupported" as SttError), stop: () => {} };
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  let interim = "";
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      interim = "";
      finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim((finalText + " " + interim).trim());
    };
    rec.onerror = (e) => {
      const map: Record<string, SttError> = { "not-allowed": "denied", "service-not-allowed": "denied", "no-speech": "no-speech", network: "network" };
      reject(map[e.error] ?? "other");
    };
    rec.onend = () => resolve((finalText || interim).trim());
  });
  rec.start();
  return { done, stop: () => rec.stop() };
}
