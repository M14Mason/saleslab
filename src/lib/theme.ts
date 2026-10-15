import type { Settings } from "./db";

const mq = () => window.matchMedia("(prefers-color-scheme: light)");
const rm = () => window.matchMedia("(prefers-reduced-motion: reduce)");

export function applyTheme(s: Pick<Settings, "theme" | "reducedMotion">) {
  const root = document.documentElement;
  const theme = s.theme === "system" ? (mq().matches ? "light" : "dark") : s.theme;
  root.dataset.theme = theme;
  root.classList.toggle("reduce-motion", s.reducedMotion === "on");
  root.classList.toggle("allow-motion", s.reducedMotion === "off");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#eaf1ed" : "#10251f");
}

export function watchSystem(cb: () => void) {
  const a = mq(), b = rm();
  a.addEventListener("change", cb); b.addEventListener("change", cb);
  return () => { a.removeEventListener("change", cb); b.removeEventListener("change", cb); };
}

export function reducedMotion(): boolean {
  const root = document.documentElement;
  if (root.classList.contains("reduce-motion")) return true;
  if (root.classList.contains("allow-motion")) return false;
  return rm().matches;
}
