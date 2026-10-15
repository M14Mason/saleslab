// Tiny module (no dependencies) so the app shell can check the key without loading the AI client.
const KEY = "saleslab.apiKey";
export const getKey = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setKey = (k: string | null) => {
  try { if (k) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event("saleslab-auth"));
};
export const isMock = () => getKey() === "demo";
