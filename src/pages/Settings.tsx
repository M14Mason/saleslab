import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { VOICES, type VoiceId } from "../speech/tts";
import type { Difficulty } from "../../shared/wolf";

type Prefs = { voice: VoiceId; difficulty: Difficulty; autoListen: boolean };
const DEFAULTS: Prefs = { voice: "am_fenrir", difficulty: "medium", autoListen: true };

export function loadSettings(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("saleslab.prefs") || "{}") }; }
  catch { return DEFAULTS; }
}

export default function Settings() {
  const { session } = useAuth();
  const [p, setP] = useState(loadSettings());
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const save = (next: Prefs) => { setP(next); try { localStorage.setItem("saleslab.prefs", JSON.stringify(next)); } catch { /* private mode */ } };

  async function deleteHistory() {
    if (!confirm("Delete ALL your sessions, transcripts and reports? This can't be undone.")) return;
    if (!confirm("Second confirmation: permanently delete all history?")) return;
    const { error } = await supabase.from("sessions").delete().eq("user_id", session!.user.id);
    setMsg(error ? "Delete failed. Try again." : "History deleted.");
  }
  async function deleteAccount() {
    if (!confirm("Delete your account and everything in it?")) return;
    if (!confirm("Second confirmation: this is permanent. Delete account?")) return;
    const { error } = await supabase.rpc("delete_my_account");
    if (error) return setMsg("Account delete failed.");
    await supabase.auth.signOut();
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-4xl">Settings</h1>
      <section className="card p-4 flex flex-col gap-3">
        <label className="text-sm text-mute" htmlFor="voice">Wolf's voice</label>
        <select id="voice" className="bg-ink border border-line rounded-xl min-h-12 px-3" value={p.voice} onChange={(e) => save({ ...p, voice: e.target.value as VoiceId })}>
          {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <label className="text-sm text-mute" htmlFor="diff">Default difficulty</label>
        <select id="diff" className="bg-ink border border-line rounded-xl min-h-12 px-3" value={p.difficulty} onChange={(e) => save({ ...p, difficulty: e.target.value as Difficulty })}>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <label className="flex items-center justify-between min-h-12">
          <span>Auto-listen after the Wolf talks</span>
          <input type="checkbox" className="w-6 h-6 min-h-0 accent-[#d4a24c]" checked={p.autoListen} onChange={(e) => save({ ...p, autoListen: e.target.checked })} />
        </label>
      </section>

      <section className="card p-4 flex flex-col gap-3">
        <p className="text-sm text-mute">Signed in as {session?.user.email}</p>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const { error } = await supabase.auth.updateUser({ password: pw }); setMsg(error ? error.message : "Password updated."); setPw(""); }}>
          <input type="password" minLength={8} placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          <button className="btn btn-ghost shrink-0" disabled={pw.length < 8}>Update</button>
        </form>
        <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>

      <section className="card p-4 flex flex-col gap-3 text-sm">
        <p className="text-mute">Privacy: we save text transcripts and coaching reports to your account. Raw audio is never recorded or stored. Speech recognition runs through your browser's built-in service.</p>
        <button className="btn btn-ghost text-bad" onClick={deleteHistory}>Delete all history</button>
        <button className="btn btn-ghost text-bad" onClick={deleteAccount}>Delete account</button>
        {msg && <p role="status" className="text-gold">{msg}</p>}
      </section>

      <section className="card p-4 text-sm text-mute">
        <p className="text-paper mb-1">Install on iPhone</p>
        <p>Open in Safari, tap Share, then "Add to Home Screen".</p>
      </section>
    </div>
  );
}
