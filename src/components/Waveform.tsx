import { useEffect, useRef } from "react";
import { reducedMotion } from "../lib/theme";

/**
 * The live "tape": a sound-reactive line. Teal when you talk, coral when the buyer talks.
 * Canvas + one rAF loop; stops drawing when the tab is hidden; disposed on unmount.
 */
export default function Waveform({ level, who, active, height = 96 }: { level: number; who: "you" | "buyer" | "idle" | "thinking"; active: boolean; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  const whoRef = useRef(who);
  const activeRef = useRef(active);
  levelRef.current = level; whoRef.current = who; activeRef.current = active;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const still = reducedMotion();
    const hist: number[] = Array(64).fill(0);
    let raf = 0, t = 0, smooth = 0;
    const css = getComputedStyle(document.documentElement);
    const colors = () => ({
      you: css.getPropertyValue("--you").trim(), buyer: css.getPropertyValue("--buyer").trim(),
      idle: css.getPropertyValue("--line").trim(), thinking: css.getPropertyValue("--brass").trim(),
    });
    let pal = colors();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = c.clientWidth * dpr; c.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pal = colors();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(c);
    const draw = () => {
      t += 1;
      const w = c.clientWidth, h = height, mid = h / 2;
      const target = activeRef.current ? levelRef.current : 0;
      smooth += (target - smooth) * 0.25;
      const thinking = whoRef.current === "thinking";
      hist.push(thinking ? 0.12 + 0.08 * Math.sin(t / 6) : smooth);
      hist.shift();
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = pal[whoRef.current] || pal.idle;
      ctx.beginPath();
      const n = hist.length;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const amp = hist[i] * (h * 0.42);
        const y = mid + Math.sin(i * 0.9 + t * 0.18) * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (!still && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const onVis = () => { if (!document.hidden && !still) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    document.addEventListener("visibilitychange", onVis);
    const themeObs = new MutationObserver(() => { pal = colors(); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    draw();
    const stillTimer = still ? setInterval(draw, 120) : null; // reduced motion: low-rate redraw, no smooth animation
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); themeObs.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (stillTimer) clearInterval(stillTimer);
    };
  }, [height]);

  return <canvas ref={ref} aria-hidden className="w-full block" style={{ height }} />;
}
