import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new HttpError(500, `Server misconfigured: ${name} missing`);
  return v;
}

let admin: SupabaseClient | null = null;
export function db(): SupabaseClient {
  admin ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  return admin;
}

let claude: Anthropic | null = null;
export function anthropic(): Anthropic {
  claude ??= new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 1, timeout: 45_000 });
  return claude;
}

export const BUYER_MODEL = () => process.env.BUYER_MODEL || "claude-haiku-5-5";
export const COACH_MODEL = () => process.env.COACH_MODEL || "claude-sonnet-5-5";

/** Verifies the Supabase access token and returns the user id. */
export async function requireUser(req: Request): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new HttpError(401, "Sign in required");
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Session expired. Sign in again.");
  return data.user.id;
}

export async function readJson(req: Request, maxBytes = 64_000): Promise<unknown> {
  const raw = await req.text();
  if (raw.length > maxBytes) throw new HttpError(413, "Request too large");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    try {
      return Response.json(await fn(req));
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof Anthropic.APIError) {
        // Never log headers or keys. Status + type only.
        console.error("anthropic_error", e.status);
        const msg = e.status === 429 ? "AI is rate limited. Wait a few seconds." : "AI service error. Try again.";
        return Response.json({ error: msg }, { status: 502 });
      }
      console.error("unhandled", e instanceof Error ? e.message : "unknown");
      return Response.json({ error: "Server error" }, { status: 500 });
    }
  };
}
