/**
 * Wrapper around fetch() for calls to this app's own /api/* backend.
 *
 * The server requires a valid Supabase session token on every route except
 * /api/health once real Supabase credentials are configured (see the
 * requireAuth middleware in server.ts) — otherwise anyone who finds the
 * deployed URL could call the AI/Stripe/webmail endpoints directly and spend
 * the platform's Gemini/Stripe/SMTP quota without ever signing in.
 *
 * This helper attaches that token automatically so call sites don't have to
 * think about it. In demo mode (no real Supabase project configured) there
 * is no session to attach, and the server allows the request through
 * unauthenticated — matching the existing demo experience.
 */
import { getSupabaseAuthClient, isSupabaseAuthConfigured } from "../config/supabaseAuthClient";

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});

  if (isSupabaseAuthConfigured()) {
    try {
      const supabase = getSupabaseAuthClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // No session available — let the request go through as-is; the
      // server will reject it with 401 if a real Supabase project requires
      // authentication for that route.
    }
  }

  return fetch(input, { ...init, headers });
}
