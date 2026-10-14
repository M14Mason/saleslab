import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, deviceMode } from "../lib/supabase";
import { setKey, notifyAuth } from "../lib/local";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { session } = useAuth();
  const loc = useLocation() as { state?: { from?: string } };
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to={loc.state?.from ?? "/home"} replace />;
  if (deviceMode) return <KeyEntry />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res =
      mode === "in" ? await supabase.auth.signInWithPassword({ email, password: pw })
      : mode === "up" ? await supabase.auth.signUp({ email, password: pw })
      : await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/settings` });
    setBusy(false);
    if (res.error) return setMsg(res.error.message);
    if (mode === "up") setMsg("Check your email to confirm your account.");
    if (mode === "reset") setMsg("Reset link sent. Check your email.");
  }

  return (
    <div className="min-h-dvh safe flex items-center justify-center px-5">
      <form onSubmit={submit} className="card p-6 w-full max-w-sm flex flex-col gap-3">
        <h1 className="font-display text-3xl mb-2">{mode === "up" ? "Create account" : mode === "reset" ? "Reset password" : "Sign in"}</h1>
        <label className="text-sm text-mute" htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== "reset" && (
          <>
            <label className="text-sm text-mute" htmlFor="pw">Password</label>
            <input id="pw" type="password" minLength={8} autoComplete={mode === "up" ? "new-password" : "current-password"} required value={pw} onChange={(e) => setPw(e.target.value)} />
          </>
        )}
        {msg && <p role="status" className="text-sm text-gold">{msg}</p>}
        <button className="btn btn-gold mt-2" disabled={busy}>{busy ? "..." : mode === "up" ? "Create account" : mode === "reset" ? "Send link" : "Sign in"}</button>
        <div className="flex justify-between text-sm text-mute mt-2">
          <button type="button" onClick={() => setMode(mode === "up" ? "in" : "up")}>{mode === "up" ? "Have an account?" : "New here?"}</button>
          <button type="button" onClick={() => setMode("reset")}>Forgot password</button>
        </div>
      </form>
    </div>
  );
}

function KeyEntry() {
  const [k, setK] = useState("");
  return (
    <div className="min-h-dvh safe flex items-center justify-center px-5">
      <form className="card p-6 w-full max-w-sm flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); setKey(k); notifyAuth(); }}>
        <h1 className="font-display text-3xl mb-1">Add your Claude key</h1>
        <p className="text-sm text-mute">Get one at console.anthropic.com (account holder must be 18+). It's saved only in this browser and sent only to Anthropic.</p>
        <label className="text-sm text-mute" htmlFor="key">API key</label>
        <input id="key" type="password" autoComplete="off" placeholder="sk-ant-..." required value={k} onChange={(e) => setK(e.target.value)} />
        <p className="text-xs text-bad">Anyone using this device can spend on your key. Set a monthly spend limit in the Anthropic console.</p>
        <button className="btn btn-gold mt-1" disabled={!k.trim().startsWith("sk-ant-")}>Save and start</button>
      </form>
    </div>
  );
}
