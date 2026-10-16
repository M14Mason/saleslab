// ElevenLabs text-to-speech, called straight from the browser. Only used for the Wolf buyer.
// Any failure (bad key, out of credits, offline) returns null and the app falls back to the normal voice.
import type { ElevenConfig } from "../lib/keys";

export const ELEVEN_MODEL = "eleven_flash_v2_5"; // fastest model, roughly 75ms to first audio

export async function elevenAudio(cfg: ElevenConfig, text: string, ctx: BaseAudioContext, signal?: AbortSignal): Promise<AudioBuffer> {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": cfg.key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: ELEVEN_MODEL }),
    signal,
  });
  if (!r.ok) throw new ElevenError(r.status);
  return ctx.decodeAudioData(await r.arrayBuffer());
}

export class ElevenError extends Error {
  constructor(public status: number) {
    super(status === 401 ? "ElevenLabs key was rejected" : status === 404 ? "Voice ID not found" : status === 402 || status === 429 ? "ElevenLabs is out of credits or rate limited" : `ElevenLabs error ${status}`);
  }
}

/** Settings "Test" button: speaks one short line, returns a readable result. */
export async function testEleven(cfg: ElevenConfig, ctx: AudioContext): Promise<string> {
  try {
    const buf = await elevenAudio(cfg, "Sell me this pen.", ctx);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
    return "Working. You should hear the voice now.";
  } catch (e) { return e instanceof Error ? e.message : "Couldn't reach ElevenLabs."; }
}
