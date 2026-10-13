import { KokoroTTS } from "kokoro-js";

let tts: KokoroTTS | null = null;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: "load" } | { type: "speak"; id: number; text: string; voice: string; speed: number };
  try {
    if (msg.type === "load") {
      tts ??= await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "wasm" });
      self.postMessage({ type: "ready" });
    } else if (msg.type === "speak") {
      if (!tts) throw new Error("not loaded");
      const out = await tts.generate(msg.text, { voice: msg.voice as never, speed: msg.speed });
      const audio = out.audio as Float32Array;
      self.postMessage({ type: "audio", id: msg.id, audio, rate: out.sampling_rate }, { transfer: [audio.buffer] });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: "id" in msg ? msg.id : -1, message: err instanceof Error ? err.message : "tts failed" });
  }
};
