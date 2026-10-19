# WhatsApp one-click connect (Meta Tech Provider / Embedded Signup)

Goal: an AarPex customer clicks **Settings -> WhatsApp -> Connect WhatsApp with Facebook**,
logs in with Facebook in a Meta popup, picks or creates their WhatsApp Business Account,
verifies a number, and is connected. No tokens or IDs to copy.

AarPex v2.17.0 contains the whole customer side and the server side. The steps below are
the one-time setup **Aargard** does in Meta and Vercel. Until they are done the button is
disabled and the manual setup keeps working.

Official docs (check them for current requirements, Meta changes these):
- Embedded Signup overview and implementation: developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup
- Onboarding customers as a Tech Provider: same section, "onboarding-customers-as-a-tech-provider"

## What the code does

1. Browser loads Facebook's JS SDK and calls `FB.login` with your configuration id
   (`response_type: code`). Meta's popup runs the signup.
2. The popup returns a 30-second `code` (via `FB.login`) and the new `waba_id` /
   `phone_number_id` (via a `WA_EMBEDDED_SIGNUP` message event).
3. Browser sends those to `POST /api/whatsapp/embedded-signup/complete`.
4. Server (your app secret never reaches the browser):
   - exchanges the code at `/oauth/access_token` for the customer's business token,
   - `POST /{waba_id}/subscribed_apps` so this app's webhook receives that customer's events,
   - `POST /{phone_number_id}/register` with a random 6-digit PIN (the number's two-step PIN),
   - reads the display number and verified name.
5. The workspace stores the token, phone number id, WABA id and PIN in its WhatsApp settings
   (same place manual setup stores them). Incoming messages hit the existing
   `/api/whatsapp/webhook` and are matched to the workspace by phone number id.

## One-time setup (Aargard)

1. **Business**: your Meta Business portfolio must be verified (Business Settings -> Security Center).
2. **App**: developers.facebook.com -> your Business-type app. Add the **WhatsApp** product and
   **Facebook Login for Business**.
3. **Tech Provider status and App Review**: follow Meta's Tech Provider onboarding for your
   business. This normally includes business verification plus app review for advanced access to
   `whatsapp_business_management` and `whatsapp_business_messaging`. Until approved, only people
   with a role on your app (admins, developers, testers) can complete the popup; use that to test.
4. **Facebook Login for Business -> Settings**: turn on Client OAuth login, Web OAuth login,
   Enforce HTTPS, Embedded Browser OAuth Login and "Login with the JavaScript SDK". Add
   `aarpex.aarbook.com` to **Allowed domains** and **Valid OAuth redirect URIs**
   (`https://aarpex.aarbook.com/app` and `https://aarpex.aarbook.com/`).
5. **Facebook Login for Business -> Configurations**: create a configuration using the
   *WhatsApp Embedded Signup* login variation (or Meta's Embedded Signup template). Choose the
   asset permissions `whatsapp_business_management` and `whatsapp_business_messaging`. Prefer a
   configuration whose token does not expire; with an expiring-token template, customers would
   have to reconnect when it lapses. Copy the **Configuration ID**.
6. **Webhook** (App Dashboard -> WhatsApp -> Configuration): callback
   `https://aarpex.aarbook.com/api/whatsapp/webhook`, verify token = your `WHATSAPP_VERIFY_TOKEN`,
   subscribe to `messages` (and `account_update` if you want to see completion events).
7. **Vercel environment variables** (then redeploy):
   - `META_APP_ID` - App settings -> Basic -> App ID
   - `META_APP_SECRET` - App settings -> Basic -> App Secret (already used by the webhook)
   - `META_ES_CONFIG_ID` - the Configuration ID from step 5
   - `WHATSAPP_VERIFY_TOKEN` - already set for the webhook
   - optional `META_SDK_VERSION` (default `v25.0`)
8. Open Settings -> WhatsApp in AarPex: the blue **Connect WhatsApp with Facebook** button should be live.

## Customer experience

Customer (workspace admin) clicks the button -> Facebook login -> chooses or creates a
WhatsApp Business Account -> enters and verifies their phone number -> popup closes -> AarPex
shows "Connected". They then **add a payment method in WhatsApp Manager** (Meta bills them
directly) or messaging beyond the free tier is blocked. Outreach to people who haven't
messaged in 24 hours needs an approved template.

## Known limits and next steps

- The business token is stored in the workspace's WhatsApp settings (same trust model as manual
  setup). Moving tokens to a server-only table would be a good hardening step.
- Credit-line sharing (Aargard paying/reselling messages) is not built; customers pay Meta directly.
- Embedded Signup v2 is being retired by Meta (announced for 15 Oct 2026); this uses the
  configuration-id flow, which is the supported one.
- One WhatsApp number per workspace today.
