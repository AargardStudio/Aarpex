# Meta Tech Provider submission pack (AarPex)

Everything Aargard needs to go from "Embedded Signup works for people on our app" to
"any customer can connect WhatsApp". Written from Meta's current Tech Provider onboarding
docs; Meta changes screens often, so treat step names as a guide and follow the dashboard.

Sources: Meta, "Get started for Tech Providers" (developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers) and Meta's Embedded Signup docs.

---

## 1. Roadmap (do in this order)

| # | Step | Who | Notes |
|---|------|-----|-------|
| 1 | Verify the business | Hamza | Business Settings -> Security Center. Legal name, address, phone, email, website must match your documents. Must be done before App Review can start. |
| 2 | Public Privacy Policy, Terms, Data Deletion pages | Dev (not built yet) | Meta requires a working privacy policy URL and data-deletion instructions or callback. See section 7. |
| 3 | App basics | Hamza | App icon (512x512 or 1024x1024), privacy policy URL, category, data-deletion URL. |
| 4 | Tech Provider onboarding | Hamza | App Dashboard -> Use cases -> Customize -> WhatsApp -> Tech Provider onboarding. Choose "Onboard without a partner" (Aargard is the direct provider). |
| 5 | Record two videos | Hamza + dev | Scripts in section 4. Two *different* videos, one per permission. |
| 6 | Data Handling answers | Hamza | Drafts in section 3. |
| 7 | Request Advanced access | Hamza | `whatsapp_business_messaging` and `whatsapp_business_management`, with the texts in section 2. Click Begin App Review. |
| 8 | Access Verification | Hamza | App settings -> Basic -> Start Verification (if Meta shows it for your app). |
| 9 | Switch app to Live | Hamza | In Development mode Embedded Signup errors for non-role users. |
| 10 | Go-live checks | Both | Section 6. |

Meta's docs give no review timeline; plan for days to a couple of weeks and for one round of
questions or a rejection.

## 2. Permissions to request, with use-case text

Request only these two (asking for permissions you don't use is a common rejection reason):

- `whatsapp_business_messaging` (Advanced access)
- `whatsapp_business_management` (Advanced access)

**Use case, `whatsapp_business_messaging`** (paste, adjust names):

> AarPex is a multi-tenant CRM and sales platform for consultancies and service businesses
> (aarpex.aarbook.com). Each business that uses AarPex connects its own WhatsApp Business
> Account through Embedded Signup. Once connected, the business's team uses AarPex to send
> WhatsApp messages and approved templates to its own leads and customers, and to read and
> reply to the responses inside the lead's record. Messages are only sent by the business's
> own users, or by automations the business has switched on and approved in AarPex. AarPex
> never messages anyone on its own behalf and does not send to contacts the business hasn't
> added. This permission lets us send those messages and receive their replies on behalf of
> each connected business.

**Use case, `whatsapp_business_management`**:

> When a business connects through Embedded Signup, AarPex needs to manage that business's
> WhatsApp assets on its behalf: subscribe our app to the business's WhatsApp Business
> Account webhooks so replies reach the right AarPex workspace, register and read the
> status of the connected phone number (display number, verified name, quality rating), and
> let the business check that its connection is healthy from Settings -> WhatsApp. Customers
> stay in control of their own account and billing in WhatsApp Manager.

**Reviewer instructions** (paste in the notes box; put the actual login only into Meta's
credentials fields, never in this repo):

> 1. Open https://aarpex.aarbook.com/app and sign in with the reviewer account provided.
> 2. Go to Settings -> WhatsApp and click "Connect WhatsApp with Facebook" to see Embedded Signup.
> 3. Open Leads, choose the test lead, and use the WhatsApp action to send a message to the
>    test recipient number we provide. The message arrives in the WhatsApp client.
> 4. Reply from that number; the reply appears under WhatsApp in AarPex.

Create a dedicated **reviewer workspace on the Pro plan** with one test lead and a pre-filled
test recipient so nothing depends on live customer data.

## 3. Data Handling answers (drafts, check them against reality before you submit)

- **What data do we receive?** Phone numbers and message content of the end users who message
  our customers' businesses; the customer's WhatsApp Business Account id, phone number id and
  business token; basic account info (display number, verified name).
- **Why?** Only to show and send WhatsApp conversations inside the customer's own AarPex
  workspace. Not used for advertising, not sold, not shared with other customers.
- **Who processes it (data processors)?** Supabase (database hosting), Vercel (application
  hosting), Google (Gemini, only when a Pro customer uses AI drafting on message text). Confirm
  regions and DPAs for each before answering.
- **Isolation:** each customer's data sits in its own workspace (tenant); access is limited to
  that workspace's members.
- **Retention and deletion:** data stays while the workspace is active; a customer can
  disconnect WhatsApp or delete their workspace, and deletion requests are honoured within a
  stated period (decide the period: e.g. 30 days). Needs the data-deletion page (section 7).
- **Government/law-enforcement requests:** state your policy (e.g. review for validity, notify
  the customer where legally allowed, disclose the minimum). Have this decided by Hamza before
  answering; do not guess.
- **Security:** HTTPS everywhere, per-tenant row isolation, webhook payloads verified by
  Meta's HMAC signature, server-side token exchange (app secret never reaches the browser).
  *Honest gap:* business tokens are currently stored in the workspace's settings row; hardening
  this is on the roadmap (section 7). Don't claim encryption-at-rest of tokens until it exists.

## 4. Video scripts

Record at 1080p, narrate or add captions, no cuts in the key actions, test recipient only.
Meta wants **two different videos**.

### Video 1: sending and receiving (supports `whatsapp_business_messaging`)
1. Show the AarPex Settings -> WhatsApp page, status Connected, display number visible.
2. Open Leads, open the test lead, click the WhatsApp action.
3. Type a message, click send. Show the "sent" state in AarPex.
4. Cut to a phone screen-recording or WhatsApp Web on the test recipient: the message arrives
   in real time. Keep the clock or the message text visible so it clearly matches.
5. Reply from the phone. Show the reply appearing in AarPex's WhatsApp page.

### Video 2: templates and account management (supports `whatsapp_business_management`)
Meta's own page says this video must show *a message template being created*. AarPex doesn't
have a template editor. Meta allows the alternative: record WhatsApp Manager (or the API Setup
cURL script) creating a template. Show: Message Templates -> Create template -> name,
category, language, body text visible -> Submit. Then show it Approved and used from AarPex
(a template send to the test lead, outside the 24-hour window).
Also show Settings -> WhatsApp reading the number's status (Test Connection).
*Option for later:* build template listing/creation into AarPex so this video is entirely in-app.

### Optional Video 3: Embedded Signup walk-through
Connect a fresh test number via the popup end to end. Not required by Meta's checklist but
reviewers often ask how onboarding works, and it is the headline feature.

## 5. Common rejection causes to avoid

- Same video submitted for both permissions.
- Requesting permissions the app doesn't demonstrate (e.g. `business_management`).
- Privacy policy URL missing, 404, or not mentioning WhatsApp/customer data.
- Reviewer can't log in or the test lead/number isn't set up; the account must work without
  any 2FA or email confirmation step.
- App still in Development mode, or Embedded Signup domains/redirect URIs not whitelisted.
- Video doesn't visibly show the message arriving on the phone.

## 6. Go-live checks (after approval)

1. App is **Live**; Advanced access shows for both permissions.
2. Facebook Login for Business -> Settings: `aarpex.aarbook.com` in Allowed domains and
   Valid OAuth redirect URIs; JavaScript SDK login on.
3. Embedded Signup configuration id (`META_ES_CONFIG_ID`), `META_APP_ID`, `META_APP_SECRET` set
   in Vercel and redeployed. See `docs/META_TECH_PROVIDER.md`.
4. Webhook callback `https://aarpex.aarbook.com/api/whatsapp/webhook` verified and subscribed to
   `messages` (and `account_update`).
5. Connect a number from a brand-new workspace that has *no role* on your Meta app. This is the
   real test that public onboarding works.
6. Customer is told to add a payment method in WhatsApp Manager (billing for messages is
   theirs) before sending beyond the free tier.

## 7. Gaps in AarPex to close (recommended order)

1. **Privacy Policy, Terms of Service and Data Deletion pages** inside the app (public URLs,
   plus a data-deletion callback or instructions URL). Blocks the submission. Not built yet.
2. **Move business tokens to a server-only table.** Today they live in the workspace settings
   row that the browser syncs; fine for testing, weak for public onboarding.
3. **Reconnect and health handling:** detect expired/revoked tokens, show Reconnect, handle
   `account_update` webhook events.
4. **Reviewer workspace** (Pro plan, seeded lead, test recipient) kept permanently for re-reviews.
5. Optional: in-app template list/creation so Video 2 can be recorded fully in AarPex.
