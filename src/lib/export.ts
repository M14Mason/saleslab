import type { Session } from "./db";
import { SKILL_LABEL } from "../../shared/prompts";

const buyerName = (s: Session) => s.scenario.persona.name.replace(/\s*"[^"]*"\s*/g, " ").trim();

export function transcriptText(s: Session): string {
  const b = buyerName(s);
  const lines = [`${b}: ${s.scenario.opener}`, ...s.turns.map((t) => `${t.role === "seller" ? "You" : b}: ${t.text}${t.interrupted ? " (cut off)" : ""}`)];
  return `${s.scenario.title} (${s.difficulty}, ${s.mode})\n${new Date(s.startedAt).toLocaleString()}\n\n${lines.join("\n")}\n`;
}

export function reportMarkdown(s: Session): string {
  const r = s.report;
  const m = s.metrics;
  const out = [`# ${s.scenario.title}`, `${new Date(s.startedAt).toLocaleString()}. Difficulty: ${s.difficulty}. Mode: ${s.mode}.`, ""];
  if (r) {
    out.push(`## Score: ${r.overall_score}/100 (${r.outcome.replace("_", " ")})`, "", r.summary, "",
      `**Biggest strength:** ${r.top_strength}`, `**Biggest weakness:** ${r.top_weakness}`, "",
      "## Top 3 improvements", ...r.top_improvements.map((x, i) => `${i + 1}. ${x}`), "",
      "## Skills", ...r.skills.map((k) => `- ${SKILL_LABEL[k.name]}: ${k.score ?? "n/a"}. ${k.explanation}`), "",
      "## Say this instead", ...r.alternatives.flatMap((a) => [`- You: "${a.original}"`, `  - Problem: ${a.problem}`, `  - Better: "${a.better}"`, `  - Why: ${a.why}`]), "",
      "## Practice plan", ...r.practice_plan.map((x, i) => `${i + 1}. ${x}`), "", `**Next call objective:** ${r.next_objective}`, "");
  }
  if (m) out.push("## Delivery (from transcript)", `- You talked ${m.talkRatio}% of the time`, `- Questions: ${m.questions} (${m.openQuestions} open-ended)`, `- Filler words: ${m.fillerCount}`, "");
  out.push("## Transcript", "```", transcriptText(s), "```");
  return out.join("\n");
}

export function shareSummary(s: Session): string {
  const r = s.report;
  return r
    ? `I scored ${r.overall_score}/100 on "${s.scenario.title}" (${s.difficulty}) in SalesLab. ${r.outcome === "deal" ? "Closed the deal." : "No deal this time."} Next goal: ${r.next_objective}`
    : `I practiced "${s.scenario.title}" in SalesLab.`;
}

export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
