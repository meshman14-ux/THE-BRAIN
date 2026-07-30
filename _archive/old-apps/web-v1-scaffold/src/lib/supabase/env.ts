/**
 * Central place to read the Supabase env vars.
 * `configured` is false until the two NEXT_PUBLIC_ vars are set
 * (locally in .env.local, or in Vercel project settings) — the app
 * renders a friendly setup notice instead of crashing.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
