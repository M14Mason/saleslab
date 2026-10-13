import { lazy, Suspense, useRef } from "react";
import { Link } from "react-router-dom";
import { useEntrance } from "../lib/useGsap";
import { useAuth } from "../lib/auth";
import { WOLF } from "../../shared/wolf";

const Orb = lazy(() => import("../components/Orb"));

export default function Landing() {
  const ref = useRef<HTMLDivElement>(null);
  const { session } = useAuth();
  useEntrance(ref);
  const cta = session ? "/practice" : "/login";
  return (
    <div ref={ref} className="min-h-dvh safe px-5 py-10 max-w-3xl mx-auto flex flex-col gap-14">
      <header data-anim className="flex justify-between items-center">
        <span className="font-display text-2xl">SalesLab</span>
        <Link to={session ? "/home" : "/login"} className="text-sm text-mute hover:text-paper">{session ? "Dashboard" : "Sign in"}</Link>
      </header>

      <section className="text-center flex flex-col items-center gap-6">
        <div data-anim><Suspense fallback={<div style={{ height: 220 }} />}><Orb state="speaking" /></Suspense></div>
        <p data-anim className="text-gold text-sm tracking-widest uppercase">The pen challenge</p>
        <h1 data-anim className="font-display text-5xl md:text-6xl leading-tight">"Sell me this pen."</h1>
        <p data-anim className="text-mute max-w-md">
          Pitch out loud to {WOLF.name.split(" ")[0]} "The Wolf", a hard-nosed AI buyer. Then get a brutally honest breakdown of what you said.
        </p>
        <Link data-anim to={cta} className="btn btn-gold px-8">Start practicing</Link>
      </section>

      <section className="grid md:grid-cols-3 gap-3">
        {[
          ["1. Pick a difficulty", "Easy buyer, skeptical buyer, or a negotiator who walks."],
          ["2. Pitch by voice", "Talk naturally. The Wolf answers out loud."],
          ["3. Get coached", "Scores, your exact weak lines, and better ones to say."],
        ].map(([t, d]) => (
          <div data-anim key={t} className="card p-5">
            <h2 className="font-semibold mb-1">{t}</h2>
            <p className="text-mute text-sm">{d}</p>
          </div>
        ))}
      </section>

      <section data-anim className="card p-5">
        <p className="text-sm text-mute mb-2">Sample coaching note</p>
        <p>You said <span className="text-bad">"It's a really nice pen, it writes super smooth."</span></p>
        <p className="mt-2">Try <span className="text-good">"Before I do, when's the last time you signed something important?"</span> Ask first. Pitch second.</p>
      </section>

      <footer className="text-xs text-mute text-center pb-6">
        {WOLF.disclosure} Voice is synthetic. Conversations and coaching use Claude API credits.
      </footer>
    </div>
  );
}
