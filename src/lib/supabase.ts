import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && anon);
// The anon key is public by design. Row Level Security protects the data.
export const supabase = createClient(url || "http://localhost", anon || "missing", {
  auth: { persistSession: true, autoRefreshToken: true },
});
