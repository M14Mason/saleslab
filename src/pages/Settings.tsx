import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ClaudeError, getKey, isMock, setKey, testKey } from "../lib/claude";
import { db, useData } from "../lib/db";
import { removeDemo, seedDemo } from "../lib/demo";
import { download } from "../lib/export";
import { recentEvents } from "../lib/log";
import { canUseNatural, ctxOrNew, naturalStatus, preloadNatural } from "../speech/tts";
import { getEleven, setEleven } from "../lib/keys";
import { testEleven } from "../speech/eleven";
import MicTest from "../components/MicTest";
import { Modal, Segmented, Toggle } from "../components/ui";

export default function Settings() {
  const { settings: s, sessions } = useData();
  const [key, setK] = useState("");
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "history" | "everything" | "everything2">(null);
  const [voiceState, setVoiceState] = useState(naturalStatus());
  const file = useRef<HTMLInputElement>(null);
  const set = db.setSettings;

  useEffect(() => { const iv = setInterval(() => setVoiceState(naturalStatus()), 1000); return () => clearInterval(iv); }, []);

  async function saveKey() {
    setKeyMsg("Checking...");
    const prev = getKey();
    setKey(key);
    try { await testKey(); setKeyMsg("Key saved and working."); setK(""); }
    catch (e) { setKey(prev); setKeyMsg(e instanceof ClaudeError ? e.message : "That key didn't work."); }
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try { db.importJson(await f.text()); setMsg("Backup imported. Calls you already had were kept."); }
    catch (x) { setMsg(x instanceof Error ? x.message : "Import failed."); }
    e.target.value = "";
  }

  const perf = sessions.flatMap((x) => x.perf.firstAudioMs).slice(-20);
  const grades = sessions.map((x) => x.grading.ms).filter((x): x is number => typeof x === "number").slice(-10);
  const avg = (a: number[]) => (a.length ? (a.reduce((p, c) => p + c, 0) / a.length / 1000).toFixed(1) + "s" : "n/a");

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <h1 className="text-4xl font-extrabold">Settings</h1>

      <section className="panel p-5 flex flex-col gap-3" aria-labelledby="h-claude">
        <h2 id="h-claude" className="text-xl font-bold">Claude connection</h2>
        <p className="text-sm text-mute">{isMock() ? "Demo mode is on: scripted buyer and sample reports, no AI calls." : getKey() ? `Using key ending in ${getKey()!.slice(-4)}. Stored only in this browser.` : "No key set."}</p>
        <div className="flex gap-2">
          <input className="field" type="password" placeholder="Paste a new key (sk-ant-...)" aria-label="New API key" autoComplete="off" value={key} onChange={(e) => setK(e.target.value)} />
          <button className="btn btn-quiet shrink-0" disabled={!key.trim().startsWith("sk-ant-")} onClick={saveKey}>Save</button>
        </div>
        {keyMsg && <p role="status" className="text-sm">{keyMsg}</p>}
        <div className="flex flex-wrap gap-2">
          {!isMock() && <button className="btn btn-quiet btn-sm" onClick={() => { setKey("demo"); seedDemo(); }}>Switch to demo mode</button>}
          {sessions.some((x) => x.demo) && <button className="btn btn-quiet btn-sm" onClick={removeDemo}>Remove demo calls</button>}
          {getKey() && <button className="btn btn-danger btn-sm" onClick={() => { setKey(null); db.setSettings({ onboarded: false }); }}>Remove key from this device</button>}
        </div>
        <p className="text-xs text-mute">Cost: a typical 3-minute call plus its report uses a few cents of Claude credit. Set a monthly limit in the Anthropic console.</p>
      </section>

      <section className="panel p-5 flex flex-col gap-4" aria-labelledby="h-voice">
        <h2 id="h-voice" className="text-xl font-bold">Buyer voice</h2>
        <div className="flex flex-col gap-2">
          <span className="font-medium">Voice engine</span>
          <Segmented label="Voice engine" value={s.voiceEngine} onChange={(v) => { set({ voiceEngine: v }); preloadNatural(v); }}
            options={[{ id: "auto", label: "Auto" }, { id: "natural", label: "Natural" }, { id: "system", label: "Fastest" }]} />
          <p className="text-sm text-mute">
            Auto picks the fastest option: the natural voice on computers with a fast graphics chip (after a one-time 80 MB download), your device's built-in voice everywhere else. Natural always uses it, but can add 1 to 3 seconds per sentence on slower devices. Fastest always uses the built-in voice.
            {s.voiceEngine !== "system" && ` Natural voice: ${voiceState === "ready" ? "ready" : voiceState === "failed" ? "couldn't load on this device" : canUseNatural() || s.voiceEngine === "natural" ? "downloading in the background" : "skipped on this device"}.`}
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Voice depth: <span className="num">{s.voiceDepth === 0 ? "normal" : s.voiceDepth > -90 ? "a little deeper" : s.voiceDepth > -160 ? "deeper" : "deepest"}</span></span>
          <input type="range" min={-220} max={0} step={20} value={s.voiceDepth} onChange={(e) => set({ voiceDepth: Number(e.target.value) })} className="accent-[var(--brass)] h-10" aria-label="Voice depth" />
          <span className="text-sm text-mute">Every buyer has their own voice that matches their face. This makes all of them deeper or lighter.</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Speaking speed: <span className="num">{s.speed.toFixed(2)}x</span></span>
          <input type="range" min={0.8} max={1.4} step={0.02} value={s.speed} onChange={(e) => set({ speed: Number(e.target.value) })} className="accent-[var(--brass)] h-10" />
        </label>
      </section>

      <ElevenSection />

      <section className="panel p-5 flex flex-col gap-4" aria-labelledby="h-turn">
        <h2 id="h-turn" className="text-xl font-bold">Your turn</h2>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Pause before your turn ends: <span className="num">{(s.pauseMs / 1000).toFixed(1)}s</span></span>
          <input type="range" min={800} max={3500} step={100} value={s.pauseMs} onChange={(e) => set({ pauseMs: Number(e.target.value) })} className="accent-[var(--brass)] h-10" />
          <span className="text-sm text-mute">Raise this if the buyer cuts you off mid-thought. You can always tap Send to finish early.</span>
        </label>
        <div className="flex flex-col gap-2"><span className="font-medium">Buyer brain</span>
          <Segmented label="Buyer brain" value={s.brain} onChange={(v) => set({ brain: v })} options={[{ id: "smart", label: "Smart (recommended)" }, { id: "fast", label: "Fast" }]} />
          <span className="text-sm text-mute">Smart uses Claude Sonnet: much better at understanding messy speech and remembering the whole call. Fast uses Claude Haiku: answers a bit quicker and costs less.</span>
        </div>
        <Toggle checked={s.autoListen} onChange={(v) => set({ autoListen: v })} label="Auto-listen" desc="Mic turns on after the buyer finishes talking." />
        <Toggle checked={s.liveCoaching} onChange={(v) => set({ liveCoaching: v })} label="Live coaching by default" desc="Short tips during practice calls." />
        <div className="flex flex-col gap-2"><span className="font-medium">Default difficulty</span>
          <Segmented label="Default difficulty" value={s.defaultDifficulty} onChange={(v) => set({ defaultDifficulty: v })} options={[{ id: "easy", label: "Easy" }, { id: "medium", label: "Medium" }, { id: "hard", label: "Hard" }]} />
        </div>
        <label className="flex flex-col gap-1"><span className="font-medium">Weekly goal: <span className="num">{s.weeklyGoal}</span> calls</span>
          <input type="range" min={1} max={21} value={s.weeklyGoal} onChange={(e) => set({ weeklyGoal: Number(e.target.value) })} className="accent-[var(--brass)] h-10" />
        </label>
      </section>

      <section aria-labelledby="h-mic" className="flex flex-col gap-2">
        <h2 id="h-mic" className="text-xl font-bold">Microphone</h2>
        <MicTest />
      </section>

      <section className="panel p-5 flex flex-col gap-4" aria-labelledby="h-look">
        <h2 id="h-look" className="text-xl font-bold">Appearance and accessibility</h2>
        <div className="flex flex-col gap-2"><span className="font-medium">Theme</span>
          <Segmented label="Theme" value={s.theme} onChange={(v) => set({ theme: v })} options={[{ id: "system", label: "Match device" }, { id: "dark", label: "Dark" }, { id: "light", label: "Light" }]} />
        </div>
        <div className="flex flex-col gap-2"><span className="font-medium">Motion</span>
          <Segmented label="Motion" value={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} options={[{ id: "system", label: "Match device" }, { id: "on", label: "Reduce motion" }, { id: "off", label: "Full motion" }]} />
        </div>
        <div className="text-sm text-mute">
          <p className="font-medium text-ink">Keyboard shortcuts on a call</p>
          <p>Space: talk, send, or interrupt. M: mute the buyer. P: pause or resume. Esc: end the call.</p>
        </div>
      </section>

      <section className="panel p-5 flex flex-col gap-3" aria-labelledby="h-data">
        <h2 id="h-data" className="text-xl font-bold">Your data</h2>
        <p className="text-sm text-mute">Everything lives in this browser: {sessions.length} calls. Audio is never recorded or stored, only text transcripts. Nothing syncs between devices; use a backup file to move your history.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-quiet btn-sm" onClick={() => download(`saleslab-backup-${new Date().toISOString().slice(0, 10)}.json`, db.exportJson(), "application/json")}>Export backup</button>
          <button className="btn btn-quiet btn-sm" onClick={() => file.current?.click()}>Import backup</button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
          <button className="btn btn-danger btn-sm" onClick={() => setConfirm("history")}>Delete all calls</button>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirm("everything")}>Reset app</button>
        </div>
        {msg && <p role="status" className="text-sm">{msg}</p>}
      </section>

      <details className="panel p-5">
        <summary className="font-bold cursor-pointer">Performance</summary>
        <div className="text-sm text-mute mt-2 flex flex-col gap-1">
          <p>Average time from your last word to the buyer's first sound (last 20 turns): <b className="text-ink num">{avg(perf)}</b></p>
          <p>Average grading time (last 10): <b className="text-ink num">{avg(grades)}</b></p>
          <p>Recent events: {recentEvents().slice(-5).map((e) => e.event).join(", ") || "none"}</p>
        </div>
      </details>

      <Modal open={confirm === "history"} title="Delete all calls?" onClose={() => setConfirm(null)}>
        <p className="text-mute">All transcripts, reports, and achievements in this browser are deleted. Export a backup first if you might want them.</p>
        <div className="flex gap-2 justify-end"><button className="btn btn-quiet" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={() => { db.deleteAllSessions(); setConfirm(null); setMsg("All calls deleted."); }}>Delete all calls</button></div>
      </Modal>
      <Modal open={confirm === "everything"} title="Reset the app?" onClose={() => setConfirm(null)}>
        <p className="text-mute">Deletes calls, custom scenarios, settings, and your saved key from this browser.</p>
        <div className="flex gap-2 justify-end"><button className="btn btn-quiet" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={() => setConfirm("everything2")}>Continue</button></div>
      </Modal>
      <Modal open={confirm === "everything2"} title="Are you sure? This can't be undone." onClose={() => setConfirm(null)}>
        <p className="text-mute">Second confirmation. Everything SalesLab stored in this browser will be gone.</p>
        <div className="flex gap-2 justify-end"><button className="btn btn-quiet" onClick={() => setConfirm(null)}>Keep my data</button>
          <button className="btn btn-danger" onClick={() => { db.wipe(); setKey(null); location.hash = "#/welcome"; }}>Reset everything</button></div>
      </Modal>
    </div>
  );
}

/** ElevenLabs custom voice for Jordan "The Wolf" Hale. The key stays in this browser and is never in backups. */
function ElevenSection() {
  const [saved, setSaved] = useState(getEleven());
  const [key, setK] = useState("");
  const [voiceId, setV] = useState(saved?.voiceId ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const save = () => {
    const c = { key: key.trim() || saved?.key || "", voiceId: voiceId.trim() };
    if (!c.key || !c.voiceId) { setMsg("Add both the API key and the Voice ID."); return; }
    setEleven(c); setSaved(getEleven()); setK(""); setMsg("Saved. Tap Test to hear it.");
  };
  const test = async () => {
    if (!saved) return;
    setMsg("Testing...");
    setMsg(await testEleven(saved, ctxOrNew()));
  };
  return (
    <section className="panel p-5 flex flex-col gap-3" aria-labelledby="h-eleven">
      <h2 id="h-eleven" className="text-xl font-bold">Custom voice for the Wolf (ElevenLabs)</h2>
      <p className="text-sm text-mute">
        {saved ? `On. Using voice ${saved.voiceId} with key ending in ${saved.key.slice(-4)}. Stored only in this browser, never in backups.` : "Off. Jordan \"The Wolf\" Hale uses the normal voice."}
        {" "}Only the Wolf scenario uses it. If ElevenLabs fails or runs out of credits, the call keeps going with the normal voice. Use a voice you designed yourself, not a copy of a real person.
      </p>
      <input className="field" type="password" placeholder={saved ? "New ElevenLabs API key (leave empty to keep)" : "ElevenLabs API key"} aria-label="ElevenLabs API key" autoComplete="off" value={key} onChange={(e) => setK(e.target.value)} />
      <input className="field" placeholder="Voice ID" aria-label="ElevenLabs Voice ID" autoComplete="off" value={voiceId} onChange={(e) => setV(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-quiet btn-sm" onClick={save}>Save</button>
        {saved && <button className="btn btn-quiet btn-sm" onClick={() => void test()}>Test</button>}
        {saved && <button className="btn btn-danger btn-sm" onClick={() => { setEleven(null); setSaved(null); setV(""); setMsg("Removed."); }}>Remove</button>}
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <p className="text-xs text-mute">Cost: ElevenLabs bills per character. A 3-minute call is roughly 1,500 characters.</p>
    </section>
  );
}
