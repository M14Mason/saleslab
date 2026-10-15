import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { reducedMotion } from "../lib/theme";

export const scoreColor = (s: number) => (s >= 75 ? "var(--good)" : s >= 50 ? "var(--brass)" : "var(--bad)");

export default function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const arc = useRef<SVGCircleElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const r = 52, c = 2 * Math.PI * r;
  useLayoutEffect(() => {
    if (!arc.current || !num.current) return;
    const target = c * (1 - score / 100);
    if (reducedMotion()) { arc.current.style.strokeDashoffset = String(target); num.current.textContent = String(score); return; }
    const obj = { v: 0 };
    const ctx = gsap.context(() => {
      gsap.fromTo(arc.current, { strokeDashoffset: c }, { strokeDashoffset: target, duration: 1.2, ease: "power3.out" });
      gsap.to(obj, { v: score, duration: 1.2, ease: "power3.out", onUpdate: () => { if (num.current) num.current.textContent = String(Math.round(obj.v)); } });
    });
    return () => ctx.revert();
  }, [score, c]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Score ${score} out of 100`}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
        <circle ref={arc} cx="60" cy="60" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c} />
      </svg>
      <span ref={num} className="absolute inset-0 flex items-center justify-center display text-4xl font-bold num">0</span>
    </div>
  );
}
