import { z } from "zod";
import { CoachRequestSchema, CoachReportSchema } from "../shared/schemas.js";
import { buildCoachPrompt, COACH_SYSTEM } from "../shared/coach-prompt.js";
import { anthropic, COACH_MODEL, db, handle, HttpError, readJson, requireUser } from "./_lib/server.js";

const reportJsonSchema = z.toJSONSchema(CoachReportSchema) as Record<string, unknown>;

export const POST = handle(async (req) => {
  const userId = await requireUser(req);
  const parsed = CoachRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Invalid request");
  const { sessionId } = parsed.data;
  const sb = db();

  // Cached report: reopening never pays twice.
  const { data: cached } = await sb.from("reports").select("report, user_id").eq("session_id", sessionId).maybeSingle();
  if (cached) {
    if (cached.user_id !== userId) throw new HttpError(404, "Session not found");
    return { report: cached.report, cached: true };
  }

  // Atomic lock: only one request can move the session into 'coaching'. Blocks double-click double charges.
  const { data: locked } = await sb
    .from("sessions")
    .update({ status: "coaching" })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .in("status", ["active", "ended"])
    .select("id, difficulty")
    .maybeSingle();
  if (!locked) throw new HttpError(409, "Coaching already in progress or session not found");

  const unlock = () => sb.from("sessions").update({ status: "ended" }).eq("id", sessionId);

  try {
    const { data: msgs } = await sb.from("messages").select("idx, role, text").eq("session_id", sessionId).order("idx");
    if (!msgs || !msgs.some((m) => m.role === "seller")) throw new HttpError(400, "Nothing to coach yet. Say something first.");

    const { data: past } = await sb
      .from("reports")
      .select("report")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    const pastWeaknesses = (past ?? []).map((p) => (p.report as { top_weakness?: string }).top_weakness).filter(Boolean) as string[];

    const res = await anthropic().messages.create({
      model: COACH_MODEL(),
      max_tokens: 3000,
      system: COACH_SYSTEM,
      tools: [{ name: "submit_report", description: "Submit the coaching report.", input_schema: reportJsonSchema as never }],
      tool_choice: { type: "tool", name: "submit_report" },
      messages: [{ role: "user", content: buildCoachPrompt(locked.difficulty, msgs, pastWeaknesses) }],
    });

    const tool = res.content.find((b) => b.type === "tool_use");
    const valid = CoachReportSchema.safeParse(tool && "input" in tool ? tool.input : null);
    if (!valid.success) {
      // No automatic retry: retrying would be a second charge. User can tap "Try again".
      throw new HttpError(502, res.stop_reason === "max_tokens" ? "Report was cut off. Try again." : "Coach returned a bad report. Try again.");
    }
    const report = valid.data;

    const { error } = await sb.from("reports").insert({ session_id: sessionId, user_id: userId, report, model: COACH_MODEL() });
    if (error) throw new HttpError(500, "Could not save report");
    await sb.from("sessions").update({ status: "coached", score: report.overall_score, outcome: report.outcome }).eq("id", sessionId);
    return { report, cached: false };
  } catch (e) {
    await unlock();
    throw e;
  }
});
