import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClaudeError, generateScenario } from "../lib/claude";
import { db } from "../lib/db";
import type { Category, Scenario } from "../../shared/scenarios";
import { CATEGORY_LABEL } from "../../shared/scenarios";

const blank = (): Scenario => ({
  id: `custom-${crypto.randomUUID().slice(0, 8)}`, title: "", category: "discovery", industry: "", objective: "", product: "",
  opener: "", winCondition: "", tips: [], custom: true,
  persona: { name: "", gender: "female", title: "", company: "", personality: "", style: "", painPoints: [], goals: [], budget: "", timeline: "", hiddenMotivation: "", objections: [] },
});

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6);

export default function Builder() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const editing = params.get("edit");
  const [s, setS] = useState<Scenario>(() => (editing && db.get().customScenarios.find((x) => x.id === editing)) || blank());
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof Scenario>(k: K, v: Scenario[K]) => setS((x) => ({ ...x, [k]: v }));
  const setP = <K extends keyof Scenario["persona"]>(k: K, v: Scenario["persona"][K]) => setS((x) => ({ ...x, persona: { ...x.persona, [k]: v } }));

  async function generate() {
    if (!brief.trim()) return;
    setBusy(true); setErr(null);
    try {
      const g = await generateScenario(brief);
      setS((x) => ({ ...x, ...g, persona: { ...g.persona, voice: undefined, look: undefined }, custom: true, id: x.id, category: x.category }));
    } catch (e) {
      setErr(e instanceof ClaudeError ? e.message : "Couldn't generate. Try again.");
    } finally { setBusy(false); }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const clean: Scenario = { ...s, title: s.title.trim().slice(0, 80), opener: s.opener.trim().slice(0, 300) };
    db.saveScenario(clean);
    nav(`/practice/${clean.id}`, { replace: true });
  }

  const valid = s.title.trim() && s.opener.trim() && s.product.trim() && s.persona.name.trim();

  return (
    <form onSubmit={save} className="flex flex-col gap-5 max-w-2xl">
      <Link to="/practice" className="text-sm text-mute hover:text-ink w-fit">Back to scenarios</Link>
      <h1 className="text-4xl font-extrabold">{editing ? "Edit scenario" : "Create a scenario"}</h1>

      <section className="panel p-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Describe what you want to practice</span>
          <textarea className="field" placeholder="e.g. Selling a $30/month meal-kit subscription to a busy college student who thinks it's too expensive" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={500} />
        </label>
        <button type="button" className="btn btn-quiet" onClick={generate} disabled={busy || !brief.trim()}>{busy ? "Generating..." : "Generate with AI"}</button>
        {err && <p role="alert" className="text-bad text-sm">{err}</p>}
        <p className="text-xs text-mute">Uses one quick Claude call. You can edit everything after.</p>
      </section>

      <section className="panel p-5 flex flex-col gap-3">
        <h2 className="text-xl font-bold">The scenario</h2>
        <Field label="Title" value={s.title} onChange={(v) => set("title", v)} required />
        <label className="flex flex-col gap-1"><span className="text-sm font-medium">Type</span>
          <select className="field" value={s.category} onChange={(e) => set("category", e.target.value as Category)}>
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <Field label="Industry" value={s.industry} onChange={(v) => set("industry", v)} />
        <Field label="What you're selling" value={s.product} onChange={(v) => set("product", v)} required />
        <Field label="Your goal on the call" value={s.objective} onChange={(v) => set("objective", v)} />
        <Field label="Buyer's first line" value={s.opener} onChange={(v) => set("opener", v)} required />
        <Field label="The buyer says yes when..." value={s.winCondition} onChange={(v) => set("winCondition", v)} />
        <Area label="Tips (one per line)" value={s.tips.join("\n")} onChange={(v) => set("tips", lines(v))} />
      </section>

      <section className="panel p-5 flex flex-col gap-3">
        <h2 className="text-xl font-bold">The buyer</h2>
        <p className="text-sm text-mute">Make them fictional. Don't use real people.</p>
        <Field label="Name" value={s.persona.name} onChange={(v) => setP("name", v)} required />
        <label className="flex flex-col gap-1"><span className="text-sm font-medium">Voice and face</span>
          <select className="field" value={s.persona.gender} onChange={(e) => setP("gender", e.target.value as "male" | "female")}>
            <option value="female">Woman</option><option value="male">Man</option>
          </select>
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Job title" value={s.persona.title} onChange={(v) => setP("title", v)} />
          <Field label="Company" value={s.persona.company} onChange={(v) => setP("company", v)} />
        </div>
        <Field label="Personality" value={s.persona.personality} onChange={(v) => setP("personality", v)} />
        <Field label="How they talk" value={s.persona.style} onChange={(v) => setP("style", v)} />
        <Area label="Pain points (one per line)" value={s.persona.painPoints.join("\n")} onChange={(v) => setP("painPoints", lines(v))} />
        <Area label="Goals (one per line)" value={s.persona.goals.join("\n")} onChange={(v) => setP("goals", lines(v))} />
        <Area label="Objections (one per line)" value={s.persona.objections.join("\n")} onChange={(v) => setP("objections", lines(v))} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Budget" value={s.persona.budget} onChange={(v) => setP("budget", v)} />
          <Field label="Timeline" value={s.persona.timeline} onChange={(v) => setP("timeline", v)} />
        </div>
        <Field label="Hidden motivation (revealed only if earned)" value={s.persona.hiddenMotivation} onChange={(v) => setP("hiddenMotivation", v)} />
      </section>

      <button className="btn btn-primary" disabled={!valid}>Save scenario</button>
    </form>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}{required && <span className="text-bad"> *</span>}</span>
      <input className="field" value={value} onChange={(e) => onChange(e.target.value)} required={required} maxLength={300} />
    </label>
  );
}
/** Keeps its own raw text so you can type new lines; the parent receives cleaned lines. */
function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [raw, setRaw] = useState(value);
  // Accept external replacements (AI generation) without fighting the user's typing.
  useEffect(() => { if (value !== raw.split("\n").map((x) => x.trim()).filter(Boolean).join("\n")) setRaw(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <textarea className="field" value={raw} onChange={(e) => { setRaw(e.target.value); onChange(e.target.value); }} />
    </label>
  );
}
