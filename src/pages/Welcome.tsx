import { useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ClaudeError, getKey, setKey, testKey } from "../lib/claude";
import { db } from "../lib/db";
import { seedDemo } from "../lib/demo";
import { useEntrance } from "../lib/useGsap";
import MicTest from "../components/MicTest";

/** First-run onboarding: what this is, your key (or demo), mic check. */
export default function Welcome() {
  const nav = useNavigate();
  const [step, setStep] = useState<"intro" | "key" | "mic">(getKey() ? "mic" : "intro");
  const [k, setK] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEntrance(ref, [step]);
  if (getKey() && db.settings().onboarded) return <Navigate to="/" replace />;

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    setKey(k);
    try {
      await testKey();
      setStep("mic");
    } catch (x) {
      setKey(null);
      setErr(x instanceof ClaudeError ? x.message : "Couldn't check the key. Try again.");
    } finally { setBusy(false); }
  }

  function demo() {
    setKey("demo");
    seedDemo();
    setStep("mic");
  }

  function finish() {
    db.setSettings({ onboarded: true });
    nav("/", { replace: true });
  }

  return (
    <div ref={ref} className="min-h-dvh safe-t safe-b px-5 py-10 max-w-xl mx-auto flex flex-col justify-center gap-8">
      <p data-anim className="display text-xl font-extrabold">SalesLab</p>

      {step === "intro" && (
        <>
          <h1 data-anim className="text-5xl md:text-6xl font-extrabold">Pick up the phone. The buyer is tough.</h1>
          <p data-anim className="text-lg text-mute">Practice real sales calls out loud with AI buyers, from the classic "sell me this pen" to a CFO with five minutes. After every call, a coach grades exactly what you said and shows you better lines.</p>
          <ul data-anim className="flex flex-col gap-3">
            <li className="panel p-4"><b>Talk, don't type.</b> <span className="text-mute">The buyer listens, interrupts, objects, and answers out loud.</span></li>
            <li className="panel p-4"><b>Graded on evidence.</b> <span className="text-mute">Every score points to the exact line in your transcript.</span></li>
            <li className="panel p-4"><b>Private by default.</b> <span className="text-mute">Your calls stay in this browser. Audio is never recorded.</span></li>
          </ul>
          <button data-anim className="btn btn-primary text-lg" onClick={() => setStep("key")}>Get started</button>
        </>
      )}

      {step === "key" && (
        <form onSubmit={saveKey} className="flex flex-col gap-4">
          <h1 data-anim className="text-4xl font-extrabold">Connect Claude</h1>
          <p data-anim className="text-mute">SalesLab uses your own Claude API key. Create one at console.anthropic.com (the account holder must be 18+). It's stored only in this browser and sent only to Anthropic.</p>
          <label data-anim className="flex flex-col gap-2">
            <span className="font-medium">API key</span>
            <input className="field" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-..." value={k} onChange={(e) => setK(e.target.value)} />
          </label>
          <p data-anim className="text-sm text-bad">Anyone using this device can spend on your key. Set a monthly spend limit in the Anthropic console.</p>
          {err && <p role="alert" className="text-bad">{err}</p>}
          <button data-anim className="btn btn-primary" disabled={busy || !k.trim().startsWith("sk-ant-")}>{busy ? "Checking key..." : "Save and continue"}</button>
          <div data-anim className="panel p-4 flex flex-col gap-2">
            <p><b>No key yet?</b> <span className="text-mute">Try demo mode: a scripted buyer and sample history, no AI, no cost.</span></p>
            <button type="button" className="btn btn-quiet" onClick={demo}>Try demo mode</button>
          </div>
        </form>
      )}

      {step === "mic" && (
        <div className="flex flex-col gap-4">
          <h1 data-anim className="text-4xl font-extrabold">Check your mic</h1>
          <p data-anim className="text-mute">Say a few words. The line should jump when you talk. You can skip this and do it later in Settings.</p>
          <div data-anim><MicTest /></div>
          <button data-anim className="btn btn-primary" onClick={finish}>Start training</button>
        </div>
      )}
    </div>
  );
}
