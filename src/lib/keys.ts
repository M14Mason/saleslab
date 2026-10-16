// Tiny module (no dependencies) so the app shell can check the key without loading the AI client.
const KEY = "saleslab.apiKey";
export const getKey = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setKey = (k: string | null) => {
  try { if (k) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event("saleslab-auth"));
};
export const isMock = () => getKey() === "demo";

// ElevenLabs custom voice for the Wolf. Kept apart from settings so it never lands in a backup file.
const EL = "saleslab.eleven";
export type ElevenConfig = { key: string; voiceId: string };
export const getEleven = (): ElevenConfig | null => {
  try {
    const v = JSON.parse(localStorage.getItem(EL) ?? "null");
    return v && typeof v.key === "string" && typeof v.voiceId === "string" && v.key && v.voiceId ? v : null;
  } catch { return null; }
};
export const setEleven = (c: ElevenConfig | null) => {
  try { if (c) localStorage.setItem(EL, JSON.stringify({ key: c.key.trim(), voiceId: c.voiceId.trim() })); else localStorage.removeItem(EL); } catch { /* storage blocked */ }
};
