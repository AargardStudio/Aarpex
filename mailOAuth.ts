import crypto from "crypto";
import type { Express, Request, Response } from "express";

// Microsoft 365 / Outlook mailbox sign-in (OAuth 2.0 authorization-code flow).
//
// Why: Microsoft is retiring password-based SMTP/IMAP, and tenants with
// "Security Defaults" already block it. With this flow the person clicks
// "Sign in with Microsoft", approves access, and AarPex sends/reads mail
// with short-lived access tokens (SMTP XOAUTH2 / IMAP XOAUTH2). The
// long-lived refresh token is stored encrypted on the server only.
//
// Setup (one-time, by Aargard): register ONE multi-tenant app in Microsoft
// Entra, add redirect URI  <APP_URL>/api/mail-oauth/microsoft/callback,
// delegated permissions SMTP.Send + IMAP.AccessAsUser.All (Office 365
// Exchange Online) + offline_access, create a client secret, then paste the
// client ID + secret into Settings (founder account only). They are stored
// encrypted in the platform_settings table -- no server env vars needed
// (MS_OAUTH_CLIENT_ID / MS_OAUTH_CLIENT_SECRET still work as a fallback).

const APP_URL = () => (process.env.PUBLIC_APP_URL || process.env.APP_URL || "https://aarpex.aarbook.com").replace(/\/+$/, "");
const FOUNDER_EMAIL = "aargardglobal@gmail.com";
type Creds = { id: string; secret: string };
const REDIRECT_URI = () => `${APP_URL()}/api/mail-oauth/microsoft/callback`;
const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "profile",
  "https://outlook.office.com/SMTP.Send",
  "https://outlook.office.com/IMAP.AccessAsUser.All",
];
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";


// ---- token encryption ------------------------------------------------------
function encKey(): Buffer {
  const base = process.env.MAIL_OAUTH_ENC_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "aarpex-dev-only";
  return crypto.createHash("sha256").update(`aarpex-mail-oauth:${base}`).digest();
}
function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

// ---- signed state (CSRF + carries tenant/user/mailbox through the redirect) --
function stateKey(): string {
  return `${process.env.MAIL_OAUTH_ENC_KEY || ""}|${process.env.SUPABASE_SERVICE_ROLE_KEY || "aarpex-dev-only"}`;
}
function signState(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function readState(state: string): any | null {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expect = crypto.createHmac("sha256", stateKey()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p.exp || Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

// Platform Microsoft app credentials: stored encrypted in platform_settings
// (set from Settings by the founder account); env vars are only a fallback.
let credCache: { at: number; creds: Creds | null } | null = null;
async function getCreds(supabase: any): Promise<Creds | null> {
  if (credCache && Date.now() - credCache.at < 30_000) return credCache.creds;
  let creds: Creds | null = null;
  try {
    const { data } = await supabase.from("platform_settings").select("key,value_enc").in("key", ["ms_oauth_client_id", "ms_oauth_client_secret"]);
    const m: Record<string, string> = {};
    for (const r of data || []) m[r.key] = decrypt(r.value_enc);
    if (m.ms_oauth_client_id && m.ms_oauth_client_secret) creds = { id: m.ms_oauth_client_id, secret: m.ms_oauth_client_secret };
  } catch (e) {
    console.error("[mail-oauth] couldn't read platform credentials:", e);
  }
  if (!creds && process.env.MS_OAUTH_CLIENT_ID && process.env.MS_OAUTH_CLIENT_SECRET) {
    creds = { id: process.env.MS_OAUTH_CLIENT_ID.trim(), secret: process.env.MS_OAUTH_CLIENT_SECRET.trim() };
  }
  credCache = { at: Date.now(), creds };
  return creds;
}

async function tokenRequest(creds: Creds, params: Record<string, string>): Promise<any> {
  const r = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds.id, client_secret: creds.secret, ...params }).toString(),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error_description || data?.error || `Microsoft returned ${r.status}`;
    const err: any = new Error(String(msg).split("\r\n")[0]);
    err.code = data?.error;
    throw err;
  }
  return data;
}

function emailFromIdToken(idToken?: string): string {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8"));
    return String(payload.email || payload.preferred_username || payload.upn || "").toLowerCase();
  } catch {
    return "";
  }
}

export type MailOAuth = { email: string; accessToken: string };

export function registerMailOAuth(app: Express, getSupabase: () => any) {
  async function requireMember(req: any, res: Response, tenantId: any, adminOnly: boolean) {
    const supabase = getSupabase();
    if (!supabase) {
      res.status(503).json({ error: "Mailbox sign-in needs the database configured on the server." });
      return null;
    }
    if (typeof tenantId !== "string" || !tenantId) {
      res.status(400).json({ error: "tenantId is required." });
      return null;
    }
    const { data: me } = await supabase.from("tenant_members").select("role").eq("tenant_id", tenantId).eq("user_id", req.userId).maybeSingle();
    if (!me) {
      res.status(403).json({ error: "You are not a member of that workspace." });
      return null;
    }
    if (adminOnly && me.role !== "admin") {
      res.status(403).json({ error: "Only workspace administrators can connect a mailbox." });
      return null;
    }
    return supabase;
  }

  app.get("/api/mail-oauth/microsoft/config", async (_req, res) => {
    const creds = await getCreds(getSupabase());
    res.json({ enabled: !!creds, redirectUri: REDIRECT_URI() });
  });

  // Founder-only: view / set / clear the platform Microsoft app credentials.
  async function requireFounder(req: any, res: Response) {
    const supabase = getSupabase();
    if (!supabase) {
      res.status(503).json({ error: "Database not configured." });
      return null;
    }
    const { data } = await supabase.auth.admin.getUserById(req.userId);
    if (String(data?.user?.email || "").toLowerCase() !== FOUNDER_EMAIL) {
      res.status(403).json({ error: "Only the platform owner can change Microsoft sign-in credentials." });
      return null;
    }
    return supabase;
  }

  app.get("/api/mail-oauth/microsoft/platform-config", async (req: any, res) => {
    const supabase = await requireFounder(req, res);
    if (!supabase) return;
    const creds = await getCreds(supabase);
    const { data } = await supabase.from("platform_settings").select("updated_at").eq("key", "ms_oauth_client_secret").maybeSingle();
    res.json({ configured: !!creds, clientIdHint: creds ? `…${creds.id.slice(-6)}` : "", updatedAt: data?.updated_at || null, redirectUri: REDIRECT_URI() });
  });

  app.put("/api/mail-oauth/microsoft/platform-config", async (req: any, res) => {
    try {
      const supabase = await requireFounder(req, res);
      if (!supabase) return;
      const clientId = String(req.body?.clientId || "").trim();
      const clientSecret = String(req.body?.clientSecret || "").trim();
      if (!/^[0-9a-fA-F-]{36}$/.test(clientId)) return res.status(400).json({ error: "Application (client) ID should look like 00000000-0000-0000-0000-000000000000." });
      let secret = clientSecret;
      if (!secret) {
        const existing = await getCreds(supabase);
        if (!existing) return res.status(400).json({ error: "Client secret is required." });
        secret = existing.secret;
      }
      const now = new Date().toISOString();
      const { error } = await supabase.from("platform_settings").upsert(
        [
          { key: "ms_oauth_client_id", value_enc: encrypt(clientId), updated_at: now, updated_by: req.userId },
          { key: "ms_oauth_client_secret", value_enc: encrypt(secret), updated_at: now, updated_by: req.userId },
        ],
        { onConflict: "key" }
      );
      if (error) throw new Error(error.message);
      credCache = null;
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Could not save." });
    }
  });

  app.delete("/api/mail-oauth/microsoft/platform-config", async (req: any, res) => {
    const supabase = await requireFounder(req, res);
    if (!supabase) return;
    await supabase.from("platform_settings").delete().in("key", ["ms_oauth_client_id", "ms_oauth_client_secret"]);
    credCache = null;
    res.json({ success: true });
  });

  // Step 1: the signed-in admin asks for the Microsoft sign-in URL.
  app.post("/api/mail-oauth/microsoft/start", async (req: any, res) => {
    try {
      const creds = await getCreds(getSupabase());
      if (!creds) {
        return res.status(503).json({ error: "Microsoft sign-in isn't set up for this platform yet. The platform owner needs to add the Microsoft app credentials in Settings." });
      }
      const { tenantId, mailboxId, loginHint } = req.body || {};
      if (!mailboxId || typeof mailboxId !== "string") return res.status(400).json({ error: "mailboxId is required." });
      const supabase = await requireMember(req, res, tenantId, true);
      if (!supabase) return;
      const state = signState({ t: tenantId, u: req.userId, m: mailboxId, n: crypto.randomBytes(8).toString("hex"), exp: Date.now() + 10 * 60 * 1000 });
      const url = new URL(`${AUTHORITY}/authorize`);
      url.searchParams.set("client_id", creds.id);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("redirect_uri", REDIRECT_URI());
      url.searchParams.set("response_mode", "query");
      url.searchParams.set("scope", SCOPES.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("prompt", "select_account");
      if (loginHint && /^[^\s@]+@[^\s@]+$/.test(String(loginHint))) url.searchParams.set("login_hint", String(loginHint));
      return res.json({ url: url.toString() });
    } catch (err: any) {
      console.error("[mail-oauth] start failed:", err);
      return res.status(500).json({ error: err.message || "Could not start Microsoft sign-in." });
    }
  });

  // Step 2: Microsoft redirects the browser back here (no session header; the
  // signed state proves who started it).
  app.get("/api/mail-oauth/microsoft/callback", async (req: Request, res: Response) => {
    const back = (params: Record<string, string>) => {
      const u = new URL(`${APP_URL()}/app`);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      return res.redirect(u.toString());
    };
    try {
      const { code, state, error, error_description } = req.query as any;
      const st = readState(String(state || ""));
      if (!st) return back({ mailbox_oauth: "error", message: "This sign-in link expired. Please try again." });
      if (error) {
        return back({ mailbox_oauth: "error", mailbox: st.m, message: String(error_description || error).split("\r\n")[0].slice(0, 300) });
      }
      if (!code) return back({ mailbox_oauth: "error", mailbox: st.m, message: "Microsoft did not return an authorisation code." });
      const creds = await getCreds(getSupabase());
      if (!creds) return back({ mailbox_oauth: "error", mailbox: st.m, message: "Microsoft sign-in isn't configured on this platform." });
      const tokens = await tokenRequest(creds, {
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: REDIRECT_URI(),
        scope: SCOPES.join(" "),
      });
      if (!tokens.refresh_token) return back({ mailbox_oauth: "error", mailbox: st.m, message: "Microsoft did not grant offline access. Please try again." });
      const email = emailFromIdToken(tokens.id_token);
      if (!email) return back({ mailbox_oauth: "error", mailbox: st.m, message: "Couldn't read the signed-in email address from Microsoft." });
      const supabase = getSupabase();
      if (!supabase) return back({ mailbox_oauth: "error", mailbox: st.m, message: "Database not configured." });
      // Re-check membership at completion time, not just at start.
      const { data: me } = await supabase.from("tenant_members").select("role").eq("tenant_id", st.t).eq("user_id", st.u).maybeSingle();
      if (!me || me.role !== "admin") return back({ mailbox_oauth: "error", mailbox: st.m, message: "You no longer have permission to connect mailboxes." });
      const { error: dbErr } = await supabase.from("mail_oauth_connections").upsert(
        {
          tenant_id: st.t,
          mailbox_id: st.m,
          provider: "microsoft",
          account_email: email,
          refresh_token_enc: encrypt(tokens.refresh_token),
          scope: tokens.scope || SCOPES.join(" "),
          connected_by: st.u,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,mailbox_id" }
      );
      if (dbErr) throw new Error(dbErr.message);
      return back({ mailbox_oauth: "ok", mailbox: st.m, email });
    } catch (err: any) {
      console.error("[mail-oauth] callback failed:", err);
      return back({ mailbox_oauth: "error", message: String(err?.message || "Microsoft sign-in failed.").slice(0, 300) });
    }
  });

  app.post("/api/mail-oauth/microsoft/disconnect", async (req: any, res) => {
    try {
      const { tenantId, mailboxId } = req.body || {};
      const supabase = await requireMember(req, res, tenantId, true);
      if (!supabase) return;
      await supabase.from("mail_oauth_connections").delete().eq("tenant_id", tenantId).eq("mailbox_id", String(mailboxId || ""));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Could not disconnect." });
    }
  });
}

// Used by the send / verify / read-replies routes. Returns null when the
// request isn't using a Microsoft-connected mailbox; otherwise a fresh access
// token (refreshing it, and rotating the stored refresh token if Microsoft
// issues a new one). Throws a user-readable Error if the connection is gone.
export async function resolveMailOAuth(req: any, getSupabase: () => any): Promise<MailOAuth | null> {
  const mailboxId = req.body?.oauthMailboxId;
  if (!mailboxId || typeof mailboxId !== "string") return null;
  const tenantId = String(req.headers["x-tenant-id"] || "").trim();
  const supabase = getSupabase();
  if (!supabase || !tenantId) throw new Error("Open a workspace first to use a Microsoft-connected mailbox.");
  const { data: member } = await supabase.from("tenant_members").select("tenant_id").eq("tenant_id", tenantId).eq("user_id", req.userId).maybeSingle();
  if (!member) throw new Error("You are not a member of that workspace.");
  const { data: row } = await supabase.from("mail_oauth_connections").select("*").eq("tenant_id", tenantId).eq("mailbox_id", mailboxId).maybeSingle();
  if (!row) throw new Error("This mailbox isn't signed in to Microsoft yet. Open Settings and choose Sign in with Microsoft.");
  const creds = await getCreds(supabase);
  if (!creds) throw new Error("Microsoft sign-in isn't configured on this platform.");
  let tokens: any;
  try {
    tokens = await tokenRequest(creds, { grant_type: "refresh_token", refresh_token: decrypt(row.refresh_token_enc), scope: SCOPES.join(" ") });
  } catch (err: any) {
    if (err.code === "invalid_grant") {
      throw new Error("Microsoft sign-in for this mailbox has expired or was revoked. Open Settings and sign in with Microsoft again.");
    }
    throw new Error(`Microsoft sign-in failed: ${err.message}`);
  }
  if (tokens.refresh_token && tokens.refresh_token !== undefined) {
    await supabase
      .from("mail_oauth_connections")
      .update({ refresh_token_enc: encrypt(tokens.refresh_token), updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }
  return { email: row.account_email, accessToken: tokens.access_token };
}
