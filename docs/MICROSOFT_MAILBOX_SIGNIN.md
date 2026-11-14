# Microsoft 365 mailbox sign-in (OAuth)

Lets a workspace connect a Microsoft 365 / Outlook mailbox with **Sign in with Microsoft** instead of an SMTP password. Needed because many tenants block password SMTP (Security Defaults, "SmtpClientAuthentication is disabled") and Microsoft is retiring it.

## One-time setup (Aargard, once for the whole platform)

1. Microsoft Entra admin center -> App registrations -> **New registration**.
   - Name: `AarPex Mail`
   - Supported account types: **Accounts in any organizational directory (Multitenant)** (add personal accounts only if you want outlook.com users).
   - Redirect URI (Web): `https://aarpex.aarbook.com/api/mail-oauth/microsoft/callback`
2. API permissions -> Add -> **APIs my organization uses** -> *Office 365 Exchange Online* -> **Delegated**: `SMTP.Send`, `IMAP.AccessAsUser.All`. Also add Microsoft Graph delegated `offline_access`, `openid`, `email`, `profile`.
3. Certificates & secrets -> New client secret. Copy the **value**.
4. Branding & properties -> set a **Publisher domain** and complete **Publisher verification** (otherwise some customer tenants show "needs admin approval" instead of the normal consent screen).
5. In AarPex, sign in as the platform owner -> Settings -> Hostinger & Webmail -> choose **Microsoft 365**, and paste the Client ID and Client secret into the "Platform owner" card. They are stored encrypted in the database (`platform_settings`). **No Vercel/env changes are needed.**
6. Apply migrations `0033_mail_oauth.sql` and `0034_platform_settings.sql` (already applied live).

Until the credentials are saved the Settings page keeps showing the password form.

## Per-client requirements

- The mailbox must have **Authenticated SMTP** enabled (Exchange admin: user -> Mail -> Manage email apps). Security Defaults does *not* block the OAuth sign-in.
- The person signing in approves the Microsoft consent screen. If the client's tenant restricts user consent, their admin approves once.

## How it works

- `POST /api/mail-oauth/microsoft/start` (workspace admin) returns the Microsoft sign-in URL with a signed, 10-minute `state`.
- `GET /api/mail-oauth/microsoft/callback` exchanges the code, stores the **refresh token encrypted (AES-256-GCM)** in `mail_oauth_connections` (server-only, RLS on, no policies) and redirects back to Settings.
- Send / verify / reply-check routes receive `oauthMailboxId` instead of a password, swap it for a fresh access token, and use SMTP/IMAP XOAUTH2.
- `POST /api/mail-oauth/microsoft/disconnect` deletes the stored token.

(`MS_OAUTH_CLIENT_ID` / `MS_OAUTH_CLIENT_SECRET` env vars still work as an optional fallback.)
