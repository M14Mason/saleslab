import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);

export const TurnSchema = z.object({
  role: z.enum(["seller", "buyer"]),
  text: z.string().min(1).max(2000),
});
export type Turn = z.infer<typeof TurnSchema>;

export const MAX_TURNS = 40;

export const ConverseRequestSchema = z.object({
  sessionId: z.string().uuid(),
  idx: z.number().int().min(0).max(MAX_TURNS * 2),
  text: z.string().trim().min(1).max(1500),
});

export const CoachRequestSchema = z.object({ sessionId: z.string().uuid() });

const Score = z.number().int().min(0).max(100);

export const CATEGORIES = [
  "opening",
  "discovery",
  "listening",
  "value",
  "objections",
  "closing",
  "clarity",
] as const;

export const CoachReportSchema = z.object({
  overall_score: Score,
  summary: z.string(),
  outcome: z.enum(["deal", "no_deal", "incomplete"]),
  top_strength: z.string(),
  top_weakness: z.string(),
  categories: z.array(
    z.object({
      name: z.enum(CATEGORIES),
      score: Score.nullable(), // null = not applicable
      note: z.string(),
    }),
  ),
  key_moments: z.array(z.object({ quote: z.string(), analysis: z.string() })).max(6),
  alternatives: z
    .array(
      z.object({
        original: z.string(),
        problem: z.string(),
        better: z.string(),
        why: z.string(),
      }),
    )
    .max(4),
  delivery: z.object({
    filler_words: z.array(z.string()),
    talk_ratio_note: z.string(),
    basis: z.literal("transcript"),
  }),
  next_objective: z.string(),
});
export type CoachReport = z.infer<typeof CoachReportSchema>;
