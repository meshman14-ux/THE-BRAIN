"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "./env";

/** Browser-side Supabase client (call only when supabaseConfigured). */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
