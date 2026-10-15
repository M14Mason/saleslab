import { useEffect, useRef } from "react";
import { reducedMotion } from "../lib/theme";

/** Short celebration burst after a won deal or a high score. Skipped with reduced motion. */
export default function Confetti({ fire }: { fire: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire || reducedMotion() || !ref.current) return;
    const c = ref.current, ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const cols = ["--brass", "--you", "--buyer", "--good"].map((v) => css.getPropertyValue(v).trim());
    const parts = Array.from({ length: 90 }, () => ({
      x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4,
      r: Math.random() * 6 + 3, c: cols[Math.floor(Math.random() * cols.length)], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    }));
    let raf = 0; const t0 = performance.now();
    const tick = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
      }
      if (performance.now() - t0 < 2200) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return <canvas ref={ref} aria-hidden className="fixed inset-0 pointer-events-none z-50" style={{ width: "100vw", height: "100vh" }} />;
}
