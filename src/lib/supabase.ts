import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localClient } from "./local";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Device mode: no backend (GitHub Pages). Data + key stay in this browser. */
export const deviceMode = !(url && anon);
export const configured = true;
// The anon key is public by design. Row Level Security protects the data.
export const supabase = (deviceMode
  ? localClient
  : createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true } })) as unknown as SupabaseClient<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
