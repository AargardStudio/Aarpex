/**
 * Supabase Auth client for AarPex by Aargard Business Solutions
 *
 * IMPORTANT: This is separate from the tenant-facing "Platform Database & State"
 * settings panel. The master Supabase project URL + anon key below power real
 * account sign-up / sign-in / password reset. They are read from
 * MASTER_SUPABASE_CONFIG and are never editable from the Settings UI — only
 * an administrator can change them here, by replacing the values in
 * src/config/supabaseConfig.ts (or, in production, via environment variables).
 *
 * Until real project credentials are provided, isSupabaseAuthConfigured()
 * returns false and AuthPage falls back to its existing local "demo mode"
 * flow so the app keeps working end-to-end.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { MASTER_SUPABASE_CONFIG } from "./supabaseConfig";

const PLACEHOLDER_URL_FRAGMENT = "aargard-aarpex-master.supabase.co";
const PLACEHOLDER_ANON_KEY = "master_aarpex_anon_key_platform_token";

/**
 * True once a real Supabase project URL + anon key have been provided
 * (i.e. the placeholder values shipped in supabaseConfig.ts have been
 * replaced with live credentials).
 */
export function isSupabaseAuthConfigured(): boolean {
  const { projectUrl, anonKey } = MASTER_SUPABASE_CONFIG;
  if (!projectUrl || !anonKey) return false;
  if (projectUrl.includes(PLACEHOLDER_URL_FRAGMENT)) return false;
  if (anonKey.includes(PLACEHOLDER_ANON_KEY)) return false;
  try {
    // Must be a syntactically valid URL beginning with https://
    const u = new URL(projectUrl);
    if (u.protocol !== "https:") return false;
  } catch {
    return false;
  }
  return true;
}

let cachedClient: SupabaseClient | null = null;

/**
 * Lazily creates (and caches) the Supabase client used for authentication.
 * Only call auth methods on this client after checking
 * isSupabaseAuthConfigured() — with placeholder credentials the client can
 * still be constructed, but every network call will fail.
 */
export function getSupabaseAuthClient(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(MASTER_SUPABASE_CONFIG.projectUrl, MASTER_SUPABASE_CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return cachedClient;
}
