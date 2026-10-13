import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { coach } from "../lib/api";
import type { CoachReport } from "../../shared/schemas";
import ScoreRing from "../components/ScoreRing";
import { useEntrance } from "../lib/useGsap";

const LABELS: Record<string, string> = {
  opening: "Opening", discovery: "Discovery", listening: "Listening", value: "Value",
  objections: "Objections", closing: "Closing", clarity: "Clarity",
};

export default function SessionReport() {
  const { id } = useParams();
  const [report, setReport] = useState<CoachReport | null>(null);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const [state, setState] = useState<"loading" | "coaching" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [showT, setShowT] = useState(false);
  const started = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  useEntrance(ref, [state === "ready"]);

  async function run() {
    setState("coaching");
    try {
      const r = await coach(id!);
      setReport(r.report);
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  useEffect(() => {
    if (started.current) return; // StrictMode double-run guard: never fire coaching twice
    started.current = true;
    supabase.from("messages").select("role, text").eq("session_id", id!).order("idx")
      .then(({ data }) => setTranscript((data ?? []).map((m) => ({ ...m, text: m.text.replace(/\[(NO_)?DEAL\]/g, "").trim() }))));
    supabase.from("reports").select("report").eq("session_id", id!).maybeSingle().then(({ data }) => {
      if (data) { setReport(data.report as CoachReport); setState("ready"); }
      else void run();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (state === "loading") return <p className="text-mute">Loading...</p>;
  if (state === "coaching") return <div className="py-16 text-center"><p className="font-display text-3xl">Reviewing your call...</p><p className="text-mute mt-2">About 10 to 20 seconds.</p></div>;
  if (state === "error")
    return (
      <div className="py-10 flex flex-col gap-3 items-start">
        <p className="text-bad">{error}</p>
        <button className="btn btn-gold" onClick={run}>Try again</button>
        <p className="text-xs text-mute">Each try is one Claude call.</p>
      </div>
    );

  const r = report!;
  return (
    <div ref={ref} className="flex flex-col gap-4">
      <div data-anim className="card p-5 flex items-center gap-5">
        <ScoreRing score={r.overall_score} />
        <div>
          <p className={`text-sm uppercase tracking-wide ${r.outcome === "deal" ? "text-good" : "text-bad"}`}>{r.outcome.replace("_", " ")}</p>
          <p className="mt-1">{r.summary}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div data-anim className="card p-4"><p className="text-xs text-good mb-1">Biggest strength</p><p>{r.top_strength}</p></div>
        <div data-anim className="card p-4"><p className="text-xs text-bad mb-1">Biggest weakness</p><p>{r.top_weakness}</p></div>
      </div>

      <div data-anim className="card p-4">
        <p className="text-sm text-mute mb-3">Scores</p>
        {r.categories.map((c) => (
          <div key={c.name} className="py-2 border-b border-line last:border-0">
            <div className="flex justify-between"><span>{LABELS[c.name]}</span><span className="text-mute">{c.score ?? "N/A"}</span></div>
            {c.score != null && <div className="h-1 bg-line rounded mt-1"><div className="h-1 bg-gold rounded" style={{ width: `${c.score}%` }} /></div>}
            <p className="text-sm text-mute mt-1">{c.note}</p>
          </div>
        ))}
      </div>

      {r.alternatives.length > 0 && (
        <div data-anim className="card p-4 flex flex-col gap-4">
          <p className="text-sm text-mute">Say this instead</p>
          {r.alternatives.map((a, i) => (
            <div key={i} className="text-sm flex flex-col gap-1">
              <p><span className="text-bad">You:</span> "{a.original}"</p>
              <p className="text-mute">{a.problem}</p>
              <p><span className="text-good">Better:</span> "{a.better}"</p>
              <p className="text-mute">{a.why}</p>
            </div>
          ))}
        </div>
      )}

      {r.key_moments.length > 0 && (
        <div data-anim className="card p-4 flex flex-col gap-3">
          <p className="text-sm text-mute">Key moments</p>
          {r.key_moments.map((m, i) => <p key={i} className="text-sm"><span className="italic">"{m.quote}"</span> {m.analysis}</p>)}
        </div>
      )}

      <div data-anim className="card p-4 text-sm">
        <p className="text-mute mb-1">Delivery (transcript-based, not tone or pace)</p>
        {r.delivery.filler_words.length > 0 && <p>Fillers: {r.delivery.filler_words.join(", ")}</p>}
        <p>{r.delivery.talk_ratio_note}</p>
      </div>

      <div data-anim className="card p-4 border-gold">
        <p className="text-xs text-gold mb-1">Next call objective</p>
        <p>{r.next_objective}</p>
      </div>

      <button data-anim className="text-sm text-mute text-left" onClick={() => setShowT(!showT)}>{showT ? "Hide" : "Show"} transcript</button>
      {showT && (
        <div className="card p-4 text-sm flex flex-col gap-2">
          {transcript.map((t, i) => <p key={i}><span className="text-mute">{t.role === "seller" ? "You" : "Wolf"}:</span> {t.text}</p>)}
        </div>
      )}
      <Link data-anim to="/practice" className="btn btn-gold">Run it back</Link>
      <p className="text-xs text-mute">AI-generated coaching. Practice feedback, not a guarantee of real-world results.</p>
    </div>
  );
}
