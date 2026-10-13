export const validReport = {
  overall_score: 42,
  summary: "Pitched features before asking anything.",
  outcome: "no_deal",
  top_strength: "Confident opener",
  top_weakness: "No discovery",
  categories: [
    { name: "opening", score: 60, note: "ok" },
    { name: "objections", score: null, note: "never came up" },
  ],
  key_moments: [{ quote: "it writes smooth", analysis: "feature dump" }],
  alternatives: [{ original: "it writes smooth", problem: "features", better: "When did you last sign something?", why: "uncovers need" }],
  delivery: { filler_words: ["um"], talk_ratio_note: "Talked 80%", basis: "transcript" },
  next_objective: "Ask two questions before pitching.",
};
