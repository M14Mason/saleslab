import { afterEach, describe, expect, it, vi } from "vitest";
import { getEleven, setEleven } from "../../src/lib/keys";
import { elevenAudio, ElevenError, ELEVEN_MODEL } from "../../src/speech/eleven";

const fakeCtx = { decodeAudioData: vi.fn(async () => ({ sampleRate: 44100, getChannelData: () => new Float32Array(10) })) } as unknown as BaseAudioContext;

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("ElevenLabs key storage", () => {
  it("saves, trims, and removes", () => {
    expect(getEleven()).toBeNull();
    setEleven({ key: " sk_abc ", voiceId: " V1 " });
    expect(getEleven()).toEqual({ key: "sk_abc", voiceId: "V1" });
    setEleven(null);
    expect(getEleven()).toBeNull();
  });
  it("ignores broken or partial data", () => {
    localStorage.setItem("saleslab.eleven", "{bad");
    expect(getEleven()).toBeNull();
    localStorage.setItem("saleslab.eleven", JSON.stringify({ key: "", voiceId: "x" }));
    expect(getEleven()).toBeNull();
  });
  it("is not part of the app data backup", () => {
    setEleven({ key: "sk_secret", voiceId: "V1" });
    expect(localStorage.getItem("saleslab.v2") ?? "").not.toContain("sk_secret");
  });
});

describe("elevenAudio", () => {
  it("calls the streaming TTS endpoint with the key header and fast model", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }));
    await elevenAudio({ key: "sk_k", voiceId: "NKN" }, "Hi.", fakeCtx);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://api.elevenlabs.io/v1/text-to-speech/NKN");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("sk_k");
    expect(JSON.parse(init.body as string)).toEqual({ text: "Hi.", model_id: ELEVEN_MODEL });
  });
  it("throws a readable error on a bad key or no credits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));
    await expect(elevenAudio({ key: "x", voiceId: "y" }, "Hi.", fakeCtx)).rejects.toThrow(/rejected/);
    expect(new ElevenError(402).message).toMatch(/credits/);
    expect(new ElevenError(404).message).toMatch(/Voice ID/);
  });
});
