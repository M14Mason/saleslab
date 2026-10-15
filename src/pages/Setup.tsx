import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { db, useData } from "../lib/db";
import { useEntrance } from "../lib/useGsap";
import { unlockAudio } from "../speech/tts";
import { CATEGORY_LABEL, findScenario, type Difficulty } from "../../shared/scenarios";
import { Modal, Segmented, Tip, Toggle } from "../components/ui";
import type { CallSetup } from "../call/useCall";

export default function Setup() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { customScenarios, settings } = useData();
  const scenario = findScenario(id, customScenarios);
  const dParam = params.get("d");
  const [difficulty, setDifficulty] = useState<Difficulty>(dParam === "easy" || dParam === "medium" || dParam === "hard" ? dParam : settings.defaultDifficulty);
  const [mode, setMode] = useState<"practice" | "assessment">("practice");
  const [liveCoaching, setLive] = useState(settings.liveCoaching);
  const [surprise, setSurprise] = useState(false);
  const [limit, setLimit] = useState<"none" | "120" | "300">("none");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEntrance(ref, [id]);
  if (!scenario) return <Navigate to="/practice" replace />;
  const p = scenario.persona;

  function start() {
    unlockAudio(); // inside the tap: lets the buyer speak on iPhone
    const setup: CallSetup = {
      scenario: scenario!, difficulty, mode, liveCoaching: mode === "practice" && liveCoaching,
      surprise: surprise || (mode === "assessment" && difficulty === "hard"),
      timeLimitSec: limit === "none" ? null : Number(limit),
    };
    nav("/call", { state: { setup } });
  }

  return (
    <div ref={ref} className="flex flex-col gap-5">
      <Link data-anim to="/practice" className="text-sm text-mute hover:text-ink w-fit">Back to scenarios</Link>
      <header data-anim className="flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          <span className="badge">{scenario.custom ? "Your scenario" : CATEGORY_LABEL[scenario.category]}</span>
          <span className="badge">{scenario.industry}</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold">{scenario.title}</h1>
        <p className="text-lg"><b>Your goal:</b> {scenario.objective}</p>
        <p className="text-mute">You're selling: {scenario.product}</p>
      </header>

      <section data-anim className="panel p-5 flex flex-col gap-3" aria-label="Your buyer">
        <div className="flex items-center gap-3">
          <span aria-hidden className="w-12 h-12 rounded-full bg-raised border-2 border-buyer text-ink flex items-center justify-center display font-bold text-lg">{p.name.replace(/"[^"]*"/g, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</span>
          <div>
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-mute">{p.title}, {p.company}</p>
          </div>
        </div>
        <p className="text-sm"><span className="text-mute">Personality:</span> {p.personality}</p>
        {difficulty === "easy" && <p className="text-sm"><span className="text-mute">Known pains:</span> {p.painPoints.join("; ")}</p>}
        <p className="text-sm text-mute">Hidden details (budget, timeline, real motivation) come out only if you ask the right questions.</p>
      </section>

      <section data-anim className="panel p-5 flex flex-col gap-5" aria-label="Call options">
        <div className="flex flex-col gap-2">
          <span className="font-semibold">Difficulty</span>
          <Segmented label="Difficulty" value={difficulty} onChange={setDifficulty}
            options={[{ id: "easy", label: "Easy" }, { id: "medium", label: "Medium" }, { id: "hard", label: "Hard" }]} />
          <span className="text-sm text-mute">{difficulty === "easy" ? "Cooperative buyer, room to recover, tips shown." : difficulty === "medium" ? "Realistic concerns. You must ask good questions." : "Skeptical and impatient. Objections change. They can hang up."}</span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-semibold flex items-center gap-2">Mode
            <Tip label="Practice gives live tips during the call. Assessment has no help and counts as a test."><span className="text-mute text-sm border border-line rounded-full w-5 h-5 inline-flex items-center justify-center" tabIndex={0} aria-label="About modes">?</span></Tip>
          </span>
          <Segmented label="Mode" value={mode} onChange={setMode} options={[{ id: "practice", label: "Practice" }, { id: "assessment", label: "Assessment" }]} />
        </div>
        {mode === "practice" && <Toggle checked={liveCoaching} onChange={setLive} label="Live coaching" desc="Short tips after your turns, like 'ask a question first'. Free, runs on your device." />}
        <Toggle checked={surprise || (mode === "assessment" && difficulty === "hard")} onChange={setSurprise} label="Surprise objection" desc="The buyer throws one objection you can't prepare for." />
        <div className="flex flex-col gap-2">
          <span className="font-semibold">Time limit</span>
          <Segmented label="Time limit" value={limit} onChange={setLimit} options={[{ id: "none", label: "None" }, { id: "120", label: "2 min" }, { id: "300", label: "5 min" }]} />
        </div>
      </section>

      {difficulty !== "hard" && mode === "practice" && (
        <section data-anim className="panel p-5" aria-label="Tips">
          <p className="font-semibold mb-2">Tips for this buyer</p>
          <ul className="list-disc pl-5 text-mute flex flex-col gap-1">{scenario.tips.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      )}

      <div data-anim className="flex flex-wrap gap-3 sticky bottom-20 md:bottom-0 -mx-4 px-4 py-3 bg-bg/90 backdrop-blur border-t border-line md:border-0 md:mx-0 md:px-0">
        <button className="btn btn-primary text-lg flex-1 md:flex-none md:px-10" onClick={start}>Start call</button>
        {scenario.custom && <>
          <Link to={`/practice/new?edit=${scenario.id}`} className="btn btn-quiet">Edit</Link>
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
        </>}
      </div>
      <p className="text-xs text-mute">The buyer is an AI character, not a real person. Your mic is only on while the screen says "Listening". Audio is never recorded; only the text transcript is saved in this browser.</p>

      <Modal open={confirmDelete} title="Delete this scenario?" onClose={() => setConfirmDelete(false)}>
        <p className="text-mute">Past calls on it stay in your history.</p>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>Keep it</button>
          <button className="btn btn-danger" onClick={() => { db.deleteScenario(scenario.id); nav("/practice"); }}>Delete scenario</button>
        </div>
      </Modal>
    </div>
  );
}
