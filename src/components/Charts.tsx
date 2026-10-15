import { memo } from "react";
import { SKILL_LABEL, type Skill } from "../../shared/prompts";

/** Skill radar. Null skills are drawn at the center and labeled "n/a". */
export const Radar = memo(function Radar({ values, size = 300 }: { values: Partial<Record<Skill, number | null>>; size?: number }) {
  const keys = Object.keys(values) as Skill[];
  const n = keys.length;
  if (n < 3) return null;
  const cx = size / 2, cy = size / 2, R = size / 2 - 52;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v] as const;
  };
  const poly = keys.map((k, i) => pt(i, (values[k] ?? 0) / 100).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[340px] mx-auto" role="img"
      aria-label={`Skill radar: ${keys.map((k) => `${SKILL_LABEL[k]} ${values[k] ?? "n/a"}`).join(", ")}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={keys.map((_, i) => pt(i, f).join(",")).join(" ")} fill="none" stroke="var(--line)" strokeWidth="1" />
      ))}
      {keys.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />; })}
      <polygon points={poly} fill="color-mix(in oklab, var(--brass) 28%, transparent)" stroke="var(--brass)" strokeWidth="2" />
      {keys.map((k, i) => {
        const [x, y] = pt(i, 1.2);
        return (
          <text key={k} x={x} y={y} fontSize="10.5" textAnchor="middle" dominantBaseline="middle" fill="var(--mute)">
            {SKILL_LABEL[k].split(" ")[0]} {values[k] ?? "n/a"}
          </text>
        );
      })}
    </svg>
  );
});

/** Score trend with a 0-100 scale and the latest value labeled. */
export const Trend = memo(function Trend({ data, height = 120 }: { data: number[]; height?: number }) {
  if (data.length < 2) return <p className="text-sm text-mute">Your trend appears after two graded calls.</p>;
  const w = 320, h = height, pad = 8;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / 100) * (h - pad * 2);
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const last = data[data.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} role="img" aria-label={`Score trend, last ${data.length} calls, latest ${last}`}>
      {[25, 50, 75].map((g) => <line key={g} x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeDasharray="3 4" />)}
      <path d={d} fill="none" stroke="var(--brass)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(data.length - 1)} cy={y(last)} r="4.5" fill="var(--brass)" />
      <text x={x(data.length - 1) - 8} y={y(last) - 10} fontSize="12" textAnchor="end" fill="var(--ink)" className="num">{last}</text>
    </svg>
  );
});

export function Bar({ value, color = "var(--brass)" }: { value: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-line overflow-hidden" role="presentation">
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, value)}%`, background: color }} />
    </div>
  );
}
