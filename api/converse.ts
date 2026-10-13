import { ConverseRequestSchema, MAX_TURNS } from "../shared/schemas.js";
import { buyerSystemPrompt, parseOutcome, WOLF, type Difficulty } from "../shared/wolf.js";
import { anthropic, BUYER_MODEL, db, handle, HttpError, readJson, requireUser } from "./_lib/server.js";

// One seller turn in, one buyer reply out. History comes from the DB, not the client.
export const POST = handle(async (req) => {
  const userId = await requireUser(req);
  const parsed = ConverseRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Invalid request");
  const { sessionId, idx, text } = parsed.data;
  if (idx % 2 !== 0) throw new HttpError(400, "Seller turns use even indexes");

  const sb = db();
  const { data: session } = await sb
    .from("sessions")
    .select("id, user_id, difficulty, status")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== userId) throw new HttpError(404, "Session not found");
  if (session.status !== "active") throw new HttpError(409, "Session already ended");

  const { data: history } = await sb
    .from("messages")
    .select("idx, role, text")
    .eq("session_id", sessionId)
    .order("idx");
  const msgs = history ?? [];

  // Idempotency: if this turn was already answered (retry after a network drop), return the saved reply. No new charge.
  const existingReply = msgs.find((m) => m.idx === idx + 1);
  if (existingReply) {
    const { text: replyText, outcome } = parseOutcome(existingReply.text);
    return { reply: replyText, outcome, cached: true };
  }
  if (idx !== msgs.length) throw new HttpError(409, "Out of sync. Reload the session.");
  if (idx >= MAX_TURNS * 2) throw new HttpError(409, "Turn limit reached. End the session for coaching.");

  // Abuse guard: protects your key if the site is found. Raise DAILY_TURN_LIMIT if you hit it.
  const limit = Number(process.env.DAILY_TURN_LIMIT || 300);
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await sb
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "buyer")
    .gte("created_at", since);
  if ((count ?? 0) >= limit) throw new HttpError(429, "Daily practice limit reached. Back tomorrow.");

  const { error: insErr } = await sb
    .from("messages")
    .upsert({ session_id: sessionId, user_id: userId, idx, role: "seller", text }, { onConflict: "session_id,idx" });
  if (insErr) throw new HttpError(500, "Could not save your turn");

  const conversation = [...msgs, { idx, role: "seller", text }].map((m) => ({
    role: m.role === "seller" ? ("user" as const) : ("assistant" as const),
    content: m.text,
  }));

  const res = await anthropic().messages.create({
    model: BUYER_MODEL(),
    max_tokens: 160,
    system: `${buyerSystemPrompt(session.difficulty as Difficulty)}\n\nYou already opened the call by saying: "${WOLF.opener}"`,
    messages: conversation,
  });
  const raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join(" ").trim() || "Talk to me.";

  await sb
    .from("messages")
    .upsert(
      { session_id: sessionId, user_id: userId, idx: idx + 1, role: "buyer", text: raw },
      { onConflict: "session_id,idx" },
    );

  const { text: reply, outcome } = parseOutcome(raw);
  return { reply, outcome, cached: false };
});
