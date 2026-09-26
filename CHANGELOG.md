# Changelog

All notable changes to AarPex are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):
MAJOR for breaking changes, MINOR for new features, PATCH for fixes.

**Convention for future changes:** every time a change is made and published
(committed + pushed), add an entry here under `[Unreleased]` (or a new
version section) and bump `VERSION` (and `package.json`'s `version` field to
match) in the same commit.

## [Unreleased]

## [1.26.0] - 2026-09-26

### Added
- New "Instructions" page (sidebar, directly below Dashboard) -- a plain-language, expandable guide covering every section of AarPex: what it's for and how to use it. No jargon, written for a first-time user.
- "Agent Approvals" section on the main Dashboard -- pending AI-drafted actions (follow-ups, replies, negotiation offers) now show right on the home screen with one-click Approve/Reject, in addition to the dedicated Agent Approvals page.
- Pending Agent Approvals now count toward the header alert bell, with their own labeled section in the alerts dropdown (same click-to-navigate behavior as overdue invoices/urgent tasks).
- Best-effort desktop notification: when the background AI agent scan drafts new actions, the browser's Notification API fires an alert (if the user has granted permission) so pending approvals aren't missed even when the AarPex tab isn't in view.

## [1.25.0] - 2026-09-26

### Added
- **File Manager**, backed by real, quota-enforced Supabase Storage --
  new sidebar item (System section):
  - Upload files by drag-and-drop or file picker; download, delete, and
    search the workspace's files.
  - A storage usage bar shows bytes used against the plan's limit -- **1GB
    on Growth ($29/mo), 10GB on Pro ($99/mo)** -- enforced server-side on
    every upload (`/api/storage/upload`), never trusting a client-reported
    figure, so the limit holds even if someone calls the API directly.
  - **Add to Knowledge Base**: turns any file into a Knowledge Base entry
    with one click -- text-friendly files (.txt/.csv/.md/.json) pull their
    actual content in; everything else still gets a linked reference entry.
  - **Use for bulk create/update**: a spreadsheet already in the File
    Manager can be reused directly for a bulk import/update on Contacts,
    Companies, or Deals, without re-uploading the same file.
- **Excel/Google Sheets import + column remapping, generalized beyond
  Leads** to Contacts, Companies, and Deals (new "Import Contacts/
  Companies/Deals" buttons on each list view) -- the same column-mapping
  wizard Lead import already had, plus a mode this didn't have before:
  - **Create new records** (the original behavior), or
  - **Update existing records** -- rows are matched to existing records by
    one key column (email for Contacts, name for Companies/Deals) and only
    the columns you map are applied as updates, so a spreadsheet can now be
    used to bulk-alter records already in the CRM, not just create new ones.

## [1.24.0] - 2026-09-26

### Added
- **Chat-controlled agents**: the Sales Intelligence Copilot (floating chat)
  can now drive the Industry Playbook agent features directly, using the
  same explicit propose-then-confirm safety pattern it already uses for
  CRUD actions -- nothing runs until the user hits Confirm:
  - Toggle a playbook's Auto-run, max discount %, or negotiation guidance
    ("turn on the agent for Retail", "let SaaS negotiate up to 15% off").
  - Approve or reject any item already sitting in the Agent Approvals
    queue by name.
  - Trigger a "Propose Offer" (negotiation) or "Generate Personalized
    Email" for a named lead or contact -- both still only draft: an offer
    is queued into Agent Approvals and an email opens in the composer,
    neither is sent from chat.

## [1.23.0] - 2026-09-26

### Added
- **Self-writing knowledge bases**: for any industry with Auto-run enabled,
  the background agent now generates each lead's and contact's
  AI-Extracted Summary itself -- the same summary that used to require a
  manual "Generate" click -- filling in whichever records in that
  industry don't have one yet during its periodic scan.
- **Editable AI summaries**: the AI-Extracted Summary on every Lead and
  Contact profile's Knowledge tab can now be hand-edited in place (a
  pencil icon next to the existing Refresh button), so a rep can correct
  or add detail without waiting on a full AI re-generation.

## [1.22.0] - 2026-09-26

### Added
- **Autonomous agent behavior for Industry Playbooks**, gated entirely by a
  new Agent Approvals queue -- nothing an agent drafts is ever sent to a
  prospect without an explicit approval:
  - Each playbook now has an **Auto-run** toggle. When on, AarPex
    periodically scans that industry's leads/contacts (while the app is
    open in a browser tab -- there's no server-side scheduler) for leads
    overdue a follow-up (per the playbook's cadence) and for new inbox
    replies (reusing the existing IMAP reply-check), drafting a proposed
    follow-up or reply for each and queuing it for review.
  - A new **Agent Approvals** page (Intelligence section) lists every
    pending, approved, and rejected action with a live badge count. Each
    item can be edited inline before sending, approved & sent immediately,
    or rejected outright.
- **Negotiation offers**, capped by a hard, server-enforced ceiling: each
  playbook now sets a **max discount %** (0 disables negotiation entirely
  for that industry) plus free-text negotiation guidance. A new "Propose
  Offer" button on the Lead/Contact AI Analysis tab drafts a specific
  discount/price offer -- anchored below the ceiling with room to
  negotiate -- and queues it into Agent Approvals; the server clamps
  whatever the AI proposes to the configured ceiling regardless of what
  it returns.
- Notifications: the sidebar's Agent Approvals badge shows the current
  pending count so new drafted actions are never missed.

## [1.21.0] - 2026-09-26

### Added
- **Industry Playbooks** -- a new, fully configurable management view
  (Intelligence section of the sidebar) for defining AI behavior per
  industry: no fixed list, add as many as you sell into. Each playbook
  controls three things at once, everywhere AI touches a matching
  lead/contact/company:
  - **Email tone & talking points** -- tone description, talking points,
    common pain points, and objection-handling notes, fed into both the
    bulk Email Marketing AI generator and the new single-recipient
    personalized email generator.
  - **Lead qualification guidance** -- free-text guidance fed into the
    lead/contact AI Analysis prompt alongside the existing scoring logic.
  - **Follow-up cadence & channel** -- a preferred outreach channel and
    follow-up frequency/count the AI is asked to prefer.
  - A playbook auto-applies by matching the `industry` field on a
    Lead/Company (case-insensitive), no manual linking required.
- **Individual lead/contact knowledge bases**, surfaced directly in the
  Lead and Contact profile drawers under a new "Knowledge" tab -- built on
  the existing Knowledge Base data model rather than a new one:
  - **Manual notes** -- add free-text notes tied to that specific lead or
    contact.
  - **AI-Extracted Summary** -- one click summarizes the record's own
    fields and full activity history into a dense knowledge entry,
    refreshed in place (no duplicates) as new activity comes in.
  - Both feed directly into that record's personalized email generation.
- **Generate Personalized Email** -- a new single-recipient email
  generator available from both the Lead and Contact AI Analysis tab,
  distinct from bulk Email Marketing campaigns. Draws on the record's
  individual knowledge base (manual + AI-extracted), its matching
  Industry Playbook, and recent activity to draft one specific,
  ready-to-send email (not a merge-tag template), which prefills the
  existing email composer for review before sending.
- Email Marketing campaign creation now auto-detects the dominant
  industry among the selected audience and, when a matching Industry
  Playbook exists, automatically applies its tone/talking points/pain
  points to the AI-generated sequence -- with a manual override dropdown
  if you'd rather pick a different playbook or none at all.

## [1.20.2] - 2026-09-25

### Fixed
- **Deleting a workspace now actually deletes it.** `deleteTenant()`
  previously only removed the workspace from local React state -- the row
  in Supabase was never touched, so the next hydrate (page reload,
  re-sign-in, reopening the app) pulled it right back in via
  `fetchMyTenantsFull()` and it reappeared as if nothing happened.
- Deleting a workspace now deletes its row in Supabase first (RLS already
  restricted this to workspace admins; every CRM table cascades off the
  tenant row, so this also removes all of that workspace's companies,
  contacts, leads, deals, invoices, etc.) and only updates local state
  once that actually succeeds.
- If the server-side delete fails (not an admin, connection problem), the
  workspace is now left in place with an error message instead of
  disappearing from the UI and coming back later.

## [1.20.1] - 2026-09-25

### Fixed
- **Email Marketing campaign sends no longer silently swallow failures.**
  Previously, sending a campaign step fired every recipient's email at once
  and immediately marked the whole batch "Sent"/"Delivered" without ever
  checking whether each individual send actually succeeded -- a failed send
  (bad address, SMTP/auth error, timeout) was caught and discarded, so a
  campaign could claim "sent to 10 recipients" when some had silently
  failed, with no way to tell which.
- Each send to `/api/webmail/send-email` is now inspected for its actual
  result (HTTP status + response body), not just whether the request threw.
- Campaign steps now store a per-recipient delivery result (delivered /
  failed + the actual error message) and the Campaign Detail view shows
  that breakdown under each step, plus a "Retry Failed" action that
  re-sends only to the recipients that failed -- not everyone again.
- The campaign list now flags any campaign with failed sends so it's
  visible without opening it.
- The logged activity for a send now reflects the real outcome
  ("Delivered" / "Partially Delivered" / "Failed") instead of always
  "Delivered".

## [1.20.0] - 2026-09-25

### Added
- **Contact Profile Drawer** — clicking a contact's name anywhere (Contacts
  table, Company 360's Contacts list) now opens a full 360° profile:
  contact details, an Activity tab (reusing the Email/WhatsApp channel-filter
  timeline pattern), and an AI Analysis tab with qualification score, buyer
  intent signals, risk factors, and a suggested opening line.
- **Lead Profile Drawer** — clicking a lead's name (Kanban card, table row,
  or Company 360's Leads list) opens the same 360° profile for leads: full
  record details, social links, an Activity tab, and the AI analyzer now
  embedded inline instead of a separate pop-up modal. The activity log is
  linked by the lead's actual `leadId` instead of matching the lead's name
  inside activity descriptions.
- Both profile drawers surface prominent, well-lit Email and WhatsApp
  acquisition buttons in the header, plus a "Planned next" banner pulled
  from the most recent logged activity's next action.
- Lead profile drawer includes a one-click "Convert to Company & Deal"
  action, wired to the same Convert flow as the Leads list.

### Changed
- SMS/text-message quick-action buttons removed from Contacts, Leads
  (Kanban + table), and Company 360 — Email and WhatsApp are the two
  supported outreach channels for now.

## [1.19.0] - 2026-09-25
### Added
- **Customer interaction history in Company 360's Timeline.** The Activity
  Timeline tab now has "All Activity / Emails Sent / WhatsApp Sent" filter
  pills with live counts, and Email/WhatsApp entries in the feed get their
  own icon and color so real sent messages stand out from calls, notes, and
  other manually logged activity. Filtering to a channel with nothing sent
  yet shows a clear empty state instead of a blank feed.
- **Twilio as a second WhatsApp provider.** Settings > WhatsApp Business now
  has a Meta Cloud API / Twilio switch. Twilio authenticates with an
  Account SID + Auth Token and sends from a WhatsApp-enabled Twilio number
  (sandbox or approved production number); free-text sends work the same
  24-hour-window rule as Meta, and template sends use a Twilio Content SID
  (Content API) in place of Meta's named/versioned templates. Both
  `/api/whatsapp/verify` and `/api/whatsapp/send-message` branch on the
  saved `provider`, and the "outside the messaging window" detection
  understands each provider's own error code (Meta 131047, Twilio 63016).
  `TenantWhatsAppConfig` gained `provider`, `twilioAccountSid`,
  `twilioAuthToken`, and `twilioWhatsAppNumber` -- stored in the same
  `whatsapp_config` jsonb column from v1.18.0, no new migration needed.
- **Social media links on Leads.** Quick Create > Lead now has a repeatable
  "Social Media" section -- pick a platform (Instagram, Facebook, LinkedIn,
  X/Twitter, TikTok, or Other) and paste a URL, add as many as you like.
  Saved links show as small clickable platform icons on both the Leads
  Kanban card and the Leads table. `Lead.socialLinks?: SocialLink[]` is
  intentionally open-ended (free-text platform) so "any other" social site
  works without a code change.

## [1.18.2] - 2026-09-25
### Changed
- **Email quick actions now open AarPex's own Compose Email popup, not the
  device's default mail app.** The Email buttons/links added in v1.18.1 on
  Company 360 (header + contacts list), the Contacts table, and Leads
  (Kanban + table) previously used a plain `mailto:` link, which hands off
  to whatever mail client is installed and skips AarPex's SMTP relay,
  attachments, and activity logging entirely. They now open the same
  in-app Compose Email modal used everywhere else, prefilled with the
  record's email and (for a lead) logging the send back to that lead's
  activity timeline -- `Activity.leadId` plumbing added end-to-end
  (`emailComposeProps`, `EmailComposeModal`, `App.tsx`) to support it.

## [1.18.1] - 2026-09-25
### Added
- **Email / WhatsApp / Text quick actions on every record you open.** Opening
  a Company now shows Email, WhatsApp, and Text (SMS) buttons right in the
  header, next to the close button, using the company's own phone/email --
  no need to drill into a tab first. The same three actions were added to
  each contact row inside a Company's Overview & Contacts tab, to every row
  in the Contacts table, and to every Lead (both the Kanban card and the
  table view) -- Email opens `mailto:`, Text opens `sms:`, and WhatsApp
  opens the compose modal shipped in v1.18.0, prefilled with that record's
  number.

## [1.18.0] - 2026-09-24
### Added
- **WhatsApp Business integration (Meta Cloud API).** A workspace can now
  connect a single WhatsApp Business phone number and send one-off
  messages to leads, contacts, and companies straight from their records --
  the same idea as the existing email compose flow, adapted for WhatsApp's
  platform rules.
  - New `Tenant.whatsappConfig` (`TenantWhatsAppConfig`): access token,
    phone number ID, business account ID, and connection status. Stored as
    one JSON object per tenant (same pattern as `stripeConfig`), synced via
    migration `0011_tenant_whatsapp_config.sql`.
  - New Settings tab, "WhatsApp Business", to enter the Meta access token
    and phone number ID and test the connection against the Graph API
    (`GET /{phoneNumberId}`), showing the verified display number, verified
    name, and quality rating on success.
  - New "Send WhatsApp Message" compose modal, opened from a global header
    button/quick-menu item or from a lead card, a contact's phone cell, or
    a company's contacts list. Supports both a free-text message (only
    valid within WhatsApp's 24-hour customer service window -- the contact
    must have messaged first or replied recently) and a pre-approved
    message template (works any time). A send rejected for being outside
    the 24-hour window is detected from Meta's own error code and the UI
    explains it and points at the template option instead of just failing.
  - New backend endpoints `POST /api/whatsapp/verify` and
    `POST /api/whatsapp/send-message`, both calling the Meta Graph API
    (`v21.0`) directly -- no new dependency.
  - Sending logs an activity to the record's timeline, same as email.
    `Activity` gained an optional `leadId` field so lead-record activity
    (not just company/contact/deal) can be tracked this way.

## [1.17.0] - 2026-09-24
### Added
- **Standardized industries and client categories.** A new `src/data/industries.ts`
  defines two shared picklists -- 25 industries (Textile & Fashion, Travel &
  Hospitality, Security Services, Cleaning & Facilities, Financial Services
  & Bookkeeping, and 20 more, plus "Other") and 9 client categories
  (Startup, SMB, Mid-Market, Enterprise, Franchise/Multi-Location,
  Government/Public Sector, Nonprofit/NGO, Reseller/Channel Partner,
  Individual/Consumer, plus "Other") -- used everywhere a Company or Lead's
  industry/category is set or targeted, so the same label means the same
  thing across the app.
  - `Company.clientCategory` and `Lead.clientCategory` (both optional
    strings, additive -- existing records are unaffected).
  - Quick Create now has a real Industry dropdown for both Company and Lead
    (previously leads silently got a hardcoded "Technology / SaaS" with no
    way to change it), plus a new optional Client Category dropdown on
    both. Picking "Other" reveals a free-text field, so nothing already in
    the list is ever a dead end.
  - Company 360 and the Companies table now show the client category
    alongside industry when one is set.
- **Product targeting by client category.** `ProductTargetCriteria` gained
  `clientCategories: string[]`, matched the same way `industries` already
  is (empty = no constraint). The Products "who should this be sold to"
  editor now shows both Industries and Client Categories as togglable chip
  pickers (seeded from the standard lists, with a free-text field for
  anything not listed) instead of a single comma-separated industries box.
  `computeProductMatches`/`hasAnyTargetCriteria` and the AI-assisted
  "set up by AI" product drafting (`/api/ai/product-assist`) all account
  for it.
- The AI Assistant's create-lead/create-company actions
  (`/api/ai/chat-assistant`) and its quick-create-from-chat handler now
  also accept and set `clientCategory`, grounded against the same standard
  picklists server-side.

## [1.16.0] - 2026-09-24
### Added
- **Multiple sending mailboxes.** A workspace is no longer limited to one
  connected mailbox -- Settings > Hostinger & Webmail now manages a list of
  mailboxes, each with its own SMTP (send) and IMAP (receive/reply-check)
  credentials, provider preset, signature, and connection status. Add,
  edit, disconnect, and set-default all live in a new mailbox picker above
  the existing connection form, which now edits whichever mailbox is
  selected instead of a single tenant-wide config.
  - Composing a single email (`EmailComposeModal`) shows a "From" mailbox
    dropdown whenever more than one is connected, defaulting to the
    workspace's default mailbox.
  - Creating an Email Marketing campaign lets you pick which mailbox sends
    it and is scanned for replies (`EmailCampaign.mailboxId`); the
    campaign's send/follow-up/reply-check actions all use that one mailbox
    consistently for its lifetime.
  - The Inbox view's "mailbox connected" gate now checks whether *any*
    connected mailbox has IMAP credentials, not just a single one.
- Invoice templates and the invoice detail view now show the workspace's
  *default* mailbox's email as the billing contact address, matching how
  it always worked when there was only one mailbox.

### Changed
- `Tenant.webmailConfig` (a single object) is now `Tenant.webmailConfigs`
  (an array); each entry gained `id`, `label`, and `isDefault`. Existing
  workspaces are migrated automatically and losslessly on next load: the
  `webmail_config` jsonb column on `tenants` is unchanged (no new
  migration needed), it simply now holds an array instead of a single
  object -- `fetchMyTenantsFull` detects the old single-object shape and
  wraps it into a one-item default mailbox the first time it's read.
- New helper module `src/lib/webmail.ts` (`getMailboxById`,
  `getDefaultMailbox`, `mailboxLabel`) centralizes "which mailbox should
  this action use" so every consumer (compose, campaigns, reply-checking,
  invoice display, the Settings mailbox list) resolves it the same way:
  explicit id if given and still present, else the tenant's default
  mailbox, else the first mailbox on file.

## [1.15.0] - 2026-09-23
### Added
- **"Generate from a link" in the Knowledge Base entry editor.** Paste a
  URL and AarPex fetches the page server-side, strips it down to plain
  text, and drafts a title/content/tags entry with AI -- framed
  differently per category:
  - Company: paste a lead's/contact's/company's own website -- drafts a
    summary of what's useful to know about them.
  - Product & Service: paste one of your own product pages -- drafts an
    entry describing that offering.
  - Dashboard Operator: paste your own About/homepage -- drafts an entry
    describing who you are.
  The draft always lands in the editor for review/editing before saving --
  nothing is created automatically. New `/api/ai/knowledge-base-from-url`
  endpoint (dependency-free HTML-to-text extraction, basic SSRF guard
  against private/internal addresses, 12s fetch timeout, graceful fallback
  to the raw extracted text if the AI call fails).
- Entries drafted this way remember their source (`sourceUrl`), shown
  under the import box when set.

## [1.14.1] - 2026-09-23
### Changed
- **Reworked what the Knowledge Base categories mean, based on real usage:**
  - **Company Knowledge Base** is now context ABOUT specific leads,
    contacts, or companies (industry background, research notes, anything
    relevant to who you're talking to) -- an entry can be attached to as
    many records as apply (e.g. one "Healthcare industry context" entry
    linked to every lead/company in that vertical) via a new searchable
    multi-select picker in the entry editor. Entries with nothing attached
    still work as general company-category reference.
  - **Dashboard Operator Knowledge Base** now covers who YOUR business is
    (background, service offering) and how it aligns with what you sell --
    absorbing what used to be Company KB's "who we are" purpose -- so the
    AI can help position your offering to a specific lead/company/contact.
    Still internal-only.
  - Product & Service Knowledge Base is unchanged.
- The floating AI chat assistant now resolves attached leads/contacts/
  companies to their names (never raw ids) and includes that scope inline
  next to each Company KB entry it's grounded with, so it can tell "this
  note is about Acme Corp" apart from general reference content.
- New `knowledge_base.linked_lead_ids` / `linked_contact_ids` /
  `linked_company_ids` columns (migration 0009, additive to the table
  added in 0008 -- re-run needed if you already applied 0008).

## [1.14.0] - 2026-09-23
### Added
- **Knowledge Base**, a new section with three categories -- Company,
  Product & Service, and Dashboard Operator Playbook (internal-only) --
  where you write free-text reference entries (title + content + optional
  tags). Full create/edit/delete/search UI, synced to Supabase like every
  other entity table (new `knowledge_base` table, migration 0008).
- The floating AI chat assistant is now grounded in this content: it
  receives your most-recently-updated Company/Product/Operator entries
  (bounded per request) alongside live CRM data, so it can answer questions
  about your business, your offerings, and internal process using what you
  actually wrote instead of generic assumptions. Operator Playbook content
  is explicitly marked internal-only in the prompt so it's never echoed
  back as customer-facing copy.
- "Knowledge Base" is now a valid destination for the assistant's
  navigate-to-screen behavior ("open the knowledge base", "show me the
  playbook").

## [1.13.5] - 2026-09-23
### Fixed
- **Syncing a large batch of companies (or contacts, leads, deals, etc.)
  could silently leave some rows missing from Supabase after a sign-out/
  sign-in.** The per-tenant cleanup step that removes locally-deleted rows
  built one delete request with every kept row's id quoted and embedded
  directly in the URL's query string; for a few hundred rows (e.g. the 210+
  companies produced by syncing 625 leads) that filter can run to several KB,
  which some proxies/CDNs won't reliably pass through. It's now computed
  safely: fetch which ids actually exist in Supabase, diff that against what
  should be kept, and delete only the genuine excess in small, explicit
  batches -- no more unbounded filter strings.
- Cleanup failures (if this delete step still can't reach Supabase for some
  other reason) now also show up as a Settings > Audit Log entry with the
  underlying error, instead of only a browser console.error.

### Added
- **Contacts now shows a totals strip** (like Companies already did): total
  contact cards, how many are reachable by email, and how many distinct
  companies are represented.

## [1.13.4] - 2026-09-23

### Fixed

- **A single bad row in a bulk sync (e.g. one malformed record among 450
  newly imported leads) used to silently fail the entire batch.** Supabase
  rejects an upsert atomically if even one row violates a constraint, so
  syncing 576 leads because one of the new ones had a problem would save
  *none* of them -- not even the otherwise-fine ones -- which is exactly
  why newly imported leads could vanish back to the old count after
  signing out and back in. Syncing now happens in chunks, and a chunk that
  fails is retried one row at a time so only the actually-bad row(s) are
  skipped instead of losing the whole batch.

### Added

- **Sync failures are now visible in the app**, not just the browser
  console. A failed save shows up as an audit log entry (Settings) naming
  the table, how many records failed, and Supabase's own error message for
  a few of them -- so a partial sync failure can actually be diagnosed
  without opening devtools.

## [1.13.3] - 2026-09-23

### Fixed

- **Found the actual catastrophic bug behind data disappearing on sign-in
  ("flashes correct data for a second, then every section goes empty"),
  including newly imported leads never saving.** The Supabase mirror sync's
  cleanup step deletes any row in a table that's no longer in the current
  local array — but when that local array was empty, the code that scopes
  the delete to "not in this list of ids" was simply never applied, so it
  ran `delete from <table> where tenant_id = ...` with nothing else
  restricting it: it deleted **every row for that tenant in that table**.
  A local array is legitimately empty for a moment on every sign-in,
  sign-out-then-in, and tenant switch — right up until the Supabase fetch
  that repopulates it finishes — and if a write-sync fired during that
  window (which nothing was preventing outside of the very first page
  load), it would wipe real, already-synced data. This is likely the root
  mechanism behind every "data vanished after reload" report this session,
  not just the lead-sync ones.
  - The mirror sync itself no longer allows an empty local array to run
    that delete step at all — it now only ever deletes rows when there's a
    real, non-empty local list to diff against.
  - Sync-to-Supabase is now also blocked for a tenant until that tenant's
    initial data fetch has actually completed at least once per sign-in /
    tenant switch (previously this was only guarded for the very first page
    load, not later sign-outs/sign-ins or switching workspaces).

## [1.13.2] - 2026-09-23

### Fixed

- **Found the actual reason data disappeared after "Sync All to
  Companies/Contacts" followed by a quick sign-out.** Every table sync to
  Supabase (companies, contacts, leads, etc.) is debounced 800ms so rapid
  edits collapse into one network call — but nothing flushed that queue
  before `signOut()` invalidated the session. If a write was still pending
  when sign-out fired, it went out a moment later with no valid session,
  Supabase's row-level security silently rejected it, and that data was
  never actually saved — even though it looked correct in the browser right
  up until sign-out. `signOut()` now flushes every pending sync and waits
  for it to land before ending the session; a `visibilitychange` listener
  does the same best-effort flush when a tab is hidden/closed.
- **A second, independent race**: companies and contacts each sync on
  their own independent debounce timer, so under normal network timing a
  dependent write (a contact's `company_id`, a lead's
  `linked_company_id`/`linked_contact_id`, a deal/invoice/task's
  company/contact reference) could reach Supabase *before* the company or
  contact it points to had finished syncing — Postgres silently rejects
  that as a foreign-key violation and the write is lost for good. Syncing
  a dependent table now flushes its companies/contacts (and, for leads,
  deals, etc.) dependency first, so the ordering is no longer left to
  chance.

## [1.13.1] - 2026-09-23

### Fixed

- **Found the real reason "Sync All to Companies/Contacts" kept looking
  broken even after the v1.11.0 fix.** That fix made the app write
  `linkedCompanyId`/`linkedContactId` onto every synced Lead, but the
  `leads` table in Supabase never had matching columns. The app's Supabase
  mirror sync upserts every field of every row in one call per table, so as
  soon as any lead carried those two fields, Postgres rejected the *entire*
  leads upsert with "column does not exist" — silently, in the browser
  console only. That meant no lead (not just the sync) was reaching
  Supabase for any tenant that had run the sync since v1.11.0 shipped: it
  looked right in the browser (state + localStorage were fine) but reverted
  on reload/re-login, since Supabase is the source of truth on every load.
  New migration `supabase/migrations/0007_lead_linked_company_contact.sql`
  adds `leads.linked_company_id` / `leads.linked_contact_id` — **run this
  migration** (or `supabase/companies_and_contacts_schema.sql`, which
  includes it alongside a full idempotent reference schema for the
  Companies and Contacts tables) in the Supabase SQL Editor.

## [1.13.0] - 2026-09-23

### Changed

- **Pro tier is now testing-only, limited to `ceo@aargard.com`.** Every
  other workspace's subscription picker (Settings and the Subscription
  modal) now only ever shows Growth ($29/mo) — Pro is filtered out of the
  list entirely rather than just disabled. This is enforced server-side
  too: `/api/subscriptions/checkout` now clamps any `plan: "Pro"` request
  down to Growth pricing unless the requester's email is on the allowlist,
  so a direct API call can't bypass the UI restriction and get $99/mo
  checkout. Purely a temporary testing gate — no change to Pro's feature
  set or price once it's ready for everyone.

## [1.12.1] - 2026-09-22

### Fixed

- **Lead import from Google Sheets (and Excel upload) only ever read the
  first tab of a multi-tab spreadsheet.** The Google Sheets link import
  used a CSV export, which can only return one tab at a time; switched to
  an XLSX export so the whole workbook comes back, and both the Sheets-link
  and file-upload import paths now flatten every tab's rows together
  instead of reading `workbook.SheetNames[0]` only.

## [1.12.0] - 2026-09-22

### Added

- Phone number field when creating a new Company (Quick Create) — it was
  already saved and editable after the fact, but the create form itself
  had no input for it. Lead and Contact quick-create already had one.
- Wired in the real Stripe Payment Link for the Pro ($99/mo) plan. Both
  the subscription upgrade picker and the "Manage Payment Method" fallback
  now send a workspace to the correct plan's real Payment Link (Growth or
  Pro) when it doesn't have a Stripe customer on file yet, instead of
  always defaulting to the Growth link.

## [1.11.0] - 2026-09-22

### Added

- **New Pro plan ($99/mo, 14-day trial like every tier)** — sits above
  Growth in the subscription picker. Pro's feature set (multiple sending
  mailboxes, AI Prompt Manager, Analysis Manager, workspace Knowledge Base,
  higher AI credit limits) is defined in `src/data/subscriptionPlans.ts`;
  the underlying functionality for those Pro-only features ships in
  follow-up releases — this release adds the plan itself and checkout at
  the correct price.
- Direct Phone on the Company 360 drawer's Overview tab is now editable
  in place (hover to reveal a pencil icon, edit, save).

### Changed

- Free trial extended from 7 days to 14 days, platform-wide (signup,
  workspace creation, subscription checkout — both client-side display and
  the Stripe Checkout `trial_period_days` on the server).
- Removed "Gemini" branding from every user-facing screen (AI Insights,
  Company 360, Leads AI analysis, the floating AI chat, sidebar badges,
  header search) — everything now reads "AarPex AI". No change to which AI
  provider actually powers these features.

### Fixed

- **"Sync All to Companies/Contacts" on the Leads page now actually
  persists.** It correctly created/matched Company and Contact records
  before, but never wrote the match back onto the Lead itself — so nothing
  about the sync survived a reload and it looked like it silently failed.
  Leads now carry `linkedCompanyId`/`linkedContactId` after a sync, shown
  as a "Linked" badge next to the lead's company name in both the Kanban
  and table views.

## [1.10.0] - 2026-09-21

### Changed

- **CEO Notes is now a global, read-only broadcast feed.** Entries are
  published by Aargard directly, ship as static content with the app
  (`src/data/ceoNotes.ts`), and are visible to every AarPex user across every
  workspace -- no one, in any account, can create, edit, or delete an entry
  from within the app anymore.
- Removed the per-tenant CEO Notes database wiring (state, sync, and CRUD)
  from `CRMContext.tsx`, the `ceo_notes` table from the tenant sync list, and
  the now-unused `/api/ai/ceo-note-assist` endpoint. The `ceo_notes` Postgres
  table itself is left in place, unused.
- `CeoNotesView` and the Dashboard's CEO Notes widget now read directly from
  the shipped `CEO_NOTES` list instead of a per-tenant database table.

## [1.9.1] - 2026-09-21

### Changed

- Moved **CEO Notes** off the sidebar and onto the Dashboard home page as a
  compact box next to "What's New in AarPex" -- its own maroon/burgundy/
  teal/black theme, showing the latest entries with a quick "New Entry"
  button and a link into the full journal.

## [1.9.0] - 2026-09-21

### Added

- New **CEO Notes** section: an internal, workspace-visible journal for the
  founder/CEO to log reflections, activity, milestones, and honest progress
  updates for the team to read -- a memoir-style running log, separate from
  CRM records.
- Each entry has a title, a free-form story, a type (Note / Activity /
  Milestone / Progress Update), a date, and tags.
- **AI-assisted writing**: jot a rough note and AarPex turns it into a
  polished, first-person entry in your voice -- you always review and edit
  before publishing, nothing is saved automatically.
- New `ceo_notes` table (`supabase/migrations/0006_ceo_notes.sql`) -- **run
  this migration before using the feature**.

## [1.8.0] - 2026-09-21

### Added

- The floating **AI chat (Sales Intelligence Copilot)** can now propose real
  CRUD actions — create, update, or delete Leads, Contacts, Companies,
  Deals, Tasks, Activities, and Invoices — instead of only answering
  questions. Every proposed action shows as a confirmation card (entity,
  type, plain-English summary) and only runs after you click **Confirm**;
  nothing is ever applied automatically.
- The AI never invents record IDs: it refers to existing records by name,
  and the server resolves those names against your actual workspace data.
  If a reference is ambiguous or not found, the action shows a clear error
  instead of guessing.
- Missing optional fields on a proposed action are filled with the same
  sane defaults used by the Quick Create form (salesperson, dates,
  currency, etc.), so a short chat request like "create a lead for Sarah
  at Acme, VP Ops" produces a complete, usable record.

## [1.7.0] - 2026-09-20

### Added

- New **Products / Services** page: define anything you sell — agency
  retainers, SaaS subscriptions, tour packages, one-off B2B products —
  manually or with AI assistance (describe it in plain language and AI
  drafts the structured fields).
- Each product carries tag-based **target criteria** (industries, company
  status, countries, lead sources, tags) plus an AI-generated **target
  audience insight** (positioning, pitch angles, ideal customer profile).
- Every product shows a **live, auto-updating match list** of which
  existing companies, leads, and contacts currently fit its targeting.
- **Email Marketing integration**: pick a product when building a
  campaign to auto-suggest its matching audience and seed the AI-written
  email copy with that product's pitch.
- New `products` table (`supabase/migrations/0005_products.sql`) and a
  `product_id` link on `email_campaigns` — **run this migration before
  using the feature**.

## [1.6.0] - 2026-09-20

### Added

- "What's New in AarPex" panel on the Dashboard home page: shows the
  current version, the latest release's marketed highlights, and an
  expandable history of earlier releases. Content lives in
  `src/data/releaseNotes.ts`, updated alongside this file per the
  convention in `CLAUDE.md`.

## [1.5.0] - 2026-09-20

### Changed

- Optimized the dashboard, sidebar, and header for mobile and tablet
  screens: the sidebar is now an off-canvas drawer below the `lg`
  breakpoint (opened via a new hamburger button), the header collapses
  its search bar into a mobile search row and tucks secondary actions
  away on small screens, and the dashboard's KPI cards, banners, and
  chart panels use tighter spacing and font sizes on phones.

## [1.4.2] - 2026-09-20

### Added

- Bulk "Sync All to Companies/Contacts" action on the Leads view toolbar,
  linking or creating a Company and Contact for every existing lead at
  once (reusing existing matches by name/email rather than duplicating).

## [1.4.1] - 2026-09-20

### Added

- Leads section on the Company 360 drawer's Business Profile tab: link
  an existing lead to that company, or create a new lead directly
  against it, without leaving the drawer.

## [1.4.0] - 2026-09-20

### Added

- Business Profiles: a new "Business Profile" tab on the Company 360
  drawer with AI-generated business analysis and a manual call log.
  Adding a lead now automatically creates a linked Contact + Company
  and kicks off the AI analysis in the background.
- Floating AI chat bubble (bottom-right, on every signed-in screen) for
  asking questions about the CRM and navigating the dashboard by voice
  of text command.
- Inbox: IMAP-based reply detection for Email Marketing campaigns,
  automatically excluding anyone who's replied from further scheduled
  follow-ups.

### Fixed

- `create_tenant_with_owner` database function had a live/deployed
  version with a mismatched parameter signature, causing the RPC to
  404 and intermittently make new workspaces, leads, and other tenant
  data appear to vanish after signing back in (migration `0003`).

## [1.3.0] - 2026-09-19

### Changed

- Workspace creation (sign-up and "add workspace") now skips the
  Stripe payment page entirely and goes straight onto the existing
  7-day free trial — no card required up front.

## [1.2.0] - 2026-09-19

### Added

- AI-generated email marketing campaigns.

### Fixed

- Entity id/uuid type mismatch that could affect data sync.

## [1.1.0] - 2026-09-19

### Changed

- A real, database-backed workspace is now required before a signed-in
  user can access the app. Previously, an account with no tenant fell
  through to a local-only placeholder workspace that looked normal but
  never synced to the database, silently losing anything entered there.

## [1.0.0] - 2026-09-17

### Added

- Initial AarPex CRM release, deployed to Vercel.

### Fixed

- Blank `/app` page, 404s on `/api/*` and `/app/*` routes, a 500
  `FUNCTION_INVOCATION_FAILED` from bundling Vite into the serverless
  function, a broken sign-in logo, and laggy typing on the sign-in
  page caused by an unmemoized animated background.
