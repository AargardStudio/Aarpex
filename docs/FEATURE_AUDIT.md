# AarPex — Feature, Usage & Workflow Audit

Purpose-built for an auditing AI (or a new engineer) to get a complete, accurate
picture of what AarPex is, what every feature does, how a real user operates
it, and how data moves through the system end to end — without having to
reverse-engineer it from the source tree first.

This file is a snapshot as of **v1.28.1** (2026-09-26). It describes
behavior, not aspiration — anything marked "Known gap" is a real, currently
unresolved limitation, not a hedge.

---

## 1. What AarPex is

AarPex is a multi-tenant CRM and sales-intelligence SaaS built by **Aargard
Business Solutions**, aimed at consultancies and service teams who need CRM
+ pipeline + billing + AI-assisted outreach in one product rather than
stitching together a CRM, an email tool, and a billing system. It's a single
React SPA (served at `/app`) backed by one Express/Node server, with
Supabase Postgres as the system of record and `localStorage` as a
same-tenant offline/instant-load cache.

- **Live instance**: `aarpex.aarbook.com/app`
- **Deployment**: Vercel (`vercel.json` — `vite build` → static `public/`
  output, `/api/*` rewritten to the bundled Express server). Pushing to
  `main` on the connected git remote is what ships a change to production;
  a local commit that hasn't been pushed changes nothing live.
- **Repo layout**: `src/` (React frontend), `server.ts` (single Express
  entrypoint — all `/api/*` routes), `supabase/` (SQL migrations), `types.ts`
  (the entire data model as TypeScript interfaces).

### Multi-tenancy model

Every tenant (a customer company using AarPex) gets an isolated data
partition. Tenant-scoped tables in Supabase carry a `tenant_id` column
enforced by Postgres Row-Level Security policies, so one tenant's SQL client
literally cannot select another tenant's rows. The frontend additionally
mirrors the active tenant's data into `localStorage` under keys like
`crm_tenant_<id>_companies`, so the app renders instantly from cache on
reload and then reconciles with Supabase in the background — a design
optimized for perceived speed over strict real-time consistency between
browser tabs.

---

## 2. Data model (what a record actually is)

All types live in `src/types.ts`. The entities a user directly creates and
edits:

| Entity | Key fields | Notes |
|---|---|---|
| **Lead** | name, company, email, phone, status (`New`→...), industry, source | Pre-qualification stage; converts into a Company/Contact/Deal. |
| **Contact** | name, email, phone, companyId, role | A person at a Company. |
| **Company** | name, industry, status (`Lead`/`Active`/...), city, rep, AI analysis cache | The account/organization record. **"Lead" is a valid `status` value on a Company** — a Company with `status: "Lead"` is not the same thing as a `Lead` record; this is a real, easy-to-misread distinction (see §7). |
| **Deal** | title, companyId, value, stage, priority, status (`Open`/`Won`/`Lost`/`On Hold`) | Sits on a Pipeline's stages. |
| **Pipeline** | name, ordered `PipelineStage[]` | Deals move stage-to-stage (kanban). |
| **Product** | name, type, pricing model, targetCriteria, AI insight cache | What's being sold; referenced by Email Campaigns and Industry Playbooks. |
| **Task** | title, status, priority, dueDate | Simple to-do, no subtasks (see §7). |
| **Invoice / Payment** | line items, status, Stripe linkage | Billing documents, can sync to/from Stripe. |
| **Activity** | type (`call`/`email`/`meeting`/...), timestamp | Timeline entries on a Lead/Contact/Company/Deal. |
| **KnowledgeBaseEntry** | category (`company`/`product`/`operator`), content | Freeform knowledge fed to the AI prompts. |
| **IndustryPlaybook** | industry (freeform text, matched against Lead/Company `industry`), productId, excludedLeadIds/excludedCompanyIds, tone/talkingPoints/painPoints/objectionNotes | The autonomous-agent config unit — see §5. |
| **AgentAction** | type (`follow_up`/`email_reply`/`negotiation_offer`), status (`pending`/`approved`/`rejected`), draft subject/body | What the autonomous agent proposes; a human approves or rejects each one (see §5). |
| **EmailCampaign** | steps (each an `EmailStep`), technique, frequency, status | A manually-built, audience-picked outbound sequence — the counterpart to an Industry Playbook's automatic, industry-matched audience. |
| **StoredFile** | source (`manual_upload`/`email_attachment`/`import`/`other`) | File Manager entries. |
| **Tenant / TenantMember / CRMSettings** | Stripe config, webmail (SMTP/IMAP) config, WhatsApp config, billing plan | Per-tenant configuration — see §6. |

**`Industry` is a freeform string, not an enum**, on both `Lead` and
`Company`. `src/data/industries.ts` supplies a suggestion list (`INDUSTRIES`)
for the picker's `<datalist>`, but any custom text is accepted and stored
as-is. This is deliberate (an agency serving many verticals needs open
values, e.g. "Car Wash" isn't in the built-in list) but it's also the
direct cause of the industry-matching fragility documented in §7.

---

## 3. Features, by sidebar section — what each does and how a user drives it

Sidebar categories, in the order they appear: **Core, Sales, Finance,
Productivity, Intelligence, Automation, System**.

### Core
- **Dashboard** — landing view. Shows KPI tiles, a "Getting Started" checklist
  (dismissible, `localStorage`-persisted — add a company, add a contact,
  create a deal, optionally enable a playbook, allow browser notifications),
  and an **Agent Approvals** panel surfacing pending `AgentAction`s inline
  with approve/reject buttons, so a user doesn't have to leave the Dashboard
  to keep the autonomous agent moving day to day.
- **Instructions** — an in-app help/how-to page (not a live doc — hand-written
  React content in `InstructionsView.tsx`), including a step-by-step
  "Running an AI-Agent-Managed Campaign" walkthrough. This is the first
  place to check/update when a feature's actual behavior changes, since nothing
  keeps it in sync with the code automatically.
- **Leads** — list + create/edit + status pipeline (`New` → `Contacted` →
  `Qualified` → ... ). Convertible into a Company/Contact/Deal.
- **Contacts** — people, each tied to a Company via `companyId`.
- **Companies** — organizations; the **Company 360° Drawer** (`Company360Drawer.tsx`)
  is the single deep-dive view per company: account details (including the
  inline-editable Industry field — see §7), AI account-health analysis,
  linked deals/invoices/activities, call log, stored files.

### Sales
- **Deals** — value/stage/priority tracking, linked to a Company and a
  Pipeline stage.
- **Pipelines** — configurable named stage sequences; Deals are dragged
  between stages (kanban).
- **Activities** — a manually logged or system-generated timeline (calls,
  emails, meetings) attachable to Leads/Contacts/Companies/Deals.
- **Products** — the sellable catalog. Each Product can carry AI-generated
  insight and target criteria, and is what an Industry Playbook or Email
  Campaign points to when it wants the AI's drafts to pitch something
  specific rather than talk generically.

### Finance
- **Invoices** — line-item documents, optional Stripe sync, themeable
  templates (`executive`/`modern`/`classic`).
- **Payments** — payment records, can originate from Stripe webhooks/sync.
- **Revenue** — aggregate revenue reporting view.
- **Stripe** — per-tenant Stripe connection status, key verification,
  product/payment-link creation, invoice/subscription listing — the
  tenant-facing half of the `/api/stripe/*` backend surface (§4).

### Productivity
- **Tasks** — to-do items with status/priority/due date. No subtasks, no
  bulk actions (see §7).

### Intelligence
- **AI Insights** — surfaces AI-generated analyses (customer health,
  deal risk, daily briefing) generated via the `/api/ai/*` endpoints.
- **Knowledge Base** — freeform entries (company facts, product facts,
  operator/process notes) that get woven into AI prompt context — this is
  how the AI's drafts and analyses stay grounded in the tenant's actual
  business rather than generic boilerplate.
- **Industry Playbooks** — see §5, the centerpiece automation feature.

### Automation
- **Agent Approvals** (its own sidebar item, `Bot` icon, in addition to the
  Dashboard panel) — the full queue/history of every `AgentAction` the
  autonomous scan has ever proposed, across all Playbooks, with the same
  approve/reject/edit-before-send controls.
- **Email Marketing** — manually built `EmailCampaign`s: pick an explicit
  audience (Leads/Companies you select, not industry-matched), pick a
  technique (`Need-Based`/`Emotional`/`Problem-Solution`/`Mixed`), pick a
  frequency, optionally link a Product, and the system schedules/sends a
  multi-step sequence. This is the campaign type that **does** have an
  audience picker — the contrast with Industry Playbooks (which don't, by
  design) is the single most common source of user confusion; §5 and §7
  cover why and what was done about it.
- **Inbox** — reply-detection surface: incoming replies to campaign/agent
  emails, so a human can see what prospects actually said.

### System
- **File Manager** — uploaded/attached/imported files (`StoredFile`),
  backed by Supabase Storage (`/api/storage/*`).
- **Reports** — cross-entity reporting.
- **Settings** — tenant configuration: Stripe keys, webmail (SMTP/IMAP)
  credentials, WhatsApp credentials, team members/roles, billing plan,
  Supabase connection info for the tenant's own data export/audit needs.

---

## 4. Backend surface (`server.ts`, 42 routes)

One Express app, no separate microservices. Grouped by purpose:

- **AI** (`/api/ai/*`, 12 routes) — every AI-generated artifact in the
  product goes through here: `customer-analysis`, `deal-analysis`,
  `daily-briefing`, `lead-analysis`, `lead-knowledge-summary`, `pitch`,
  `negotiation-offer`, `personalized-email` (the one the autonomous agent
  calls — accepts `productName`/`productPitch` to ground drafts in a
  specific Product), `email-campaign` (drafts a manual campaign's steps),
  `product-assist` (turns a plain-language description into a structured
  Product draft), `smart-search`, `knowledge-base-from-url`,
  `chat-assistant` (the floating AI chat widget).
- **Stripe** (`/api/stripe/*`, 10 routes) — balance, invoice/subscription
  listing and creation, product/payment-link creation, key verification,
  status/sync.
- **Webmail** (`/api/webmail/*`, 4 routes) — `send-email`, `send-test`,
  `verify` (SMTP), `check-replies` (IMAP poll — this is what feeds the
  Inbox view and what the autonomous agent's reply-detection depends on).
- **WhatsApp** (`/api/whatsapp/*`, 2 routes) — `send-message`, `verify`.
- **Storage** (`/api/storage/*`, 3 routes) — `upload`, `signed-url`,
  `delete` against Supabase Storage.
- **Subscriptions** (`/api/subscriptions/*`, 3 routes) — Aargard's own
  billing of its tenants: `checkout`, `billing-portal`, `verify-session`.
- **Supabase** (`/api/supabase/verify`) — lets a tenant verify their own
  Supabase connection from Settings.
- **Misc** — `/api/health`, `/api/env-check`, and the catch-all
  `GET /app` / `/app/*` that serves the SPA shell (rewritten from Vercel's
  `/app` and `/app/*` rules).

---

## 5. The Industry Playbook autonomous-agent workflow (end to end)

This is the feature most likely to confuse a new user, so it's worth
tracing completely.

1. **Create a Playbook** (Industry Playbooks → New): set an `industry`
   string (freeform — must match, after normalization, the `industry` field
   already on the Leads/Companies you want it to reach), optionally a
   Product (feeds every AI draft this playbook generates), tone/talking
   points/pain points/objection notes, and `isActive`.
2. **There is deliberately no audience picker.** A Playbook's audience is
   *implicit*: it automatically includes every Lead and Company whose
   `industry` field matches the Playbook's `industry`, live, forever —
   add a new matching Company next year and the same Playbook picks it up
   with zero additional configuration. This is the opposite design from
   Email Marketing campaigns, which have an explicit, one-time audience
   selection. Since v1.28.0, the Playbook's create/edit form has a
   **"Matching Businesses"** panel that lists exactly who currently matches
   (live, as you type the industry) with a per-business opt-out checkbox
   (`excludedLeadIds`/`excludedCompanyIds`) for excluding a specific
   business without touching its Industry field.
3. **The autonomous scan** (`runAgentScan` in `CRMContext.tsx`) runs on a
   timer — once ~15s after the app loads, then every 10 minutes, for as
   long as a browser tab with the app open exists. For every active
   Playbook, it: finds due Leads/Companies (matched by industry, minus
   exclusions) needing a follow-up or a due-date-triggered nudge; finds
   candidates with an inbound reply (via webmail reply-checking) needing a
   response; calls `/api/ai/personalized-email` (seeded with the
   Playbook's tone/talking-points/product) to draft the copy; and pushes a
   new `AgentAction` (`pending`) into the approval queue rather than
   sending anything itself.
4. **A human approves or rejects** each `AgentAction` from the Dashboard
   panel or the Agent Approvals view. Approving calls
   `approveAndSendAgentAction`, which actually sends the email (via the
   tenant's configured webmail) and flips the action to `approved`.
5. **Known architectural gap**: the scan is client-side and tab-dependent —
   it is a `setInterval` inside a mounted React context, not a server-side
   cron/queue. If no browser tab with AarPex open exists, no scanning
   happens, no matter how "Active" a Playbook looks. This is not surfaced
   anywhere in the UI; a user has every reason to believe an "Active"
   Playbook works continuously in the background.

---

## 6. Sync & persistence workflow

- **Read path**: on tenant switch/login, `fetchTenantTable<T>(table, tenantId)`
  pulls each tenant table from Supabase; results also get written into
  `localStorage` (`crm_tenant_<id>_<table>`) so the next load is instant
  before the network round-trip resolves.
- **Write path**: local React state updates immediately (optimistic), a
  `useEffect` keyed on that state mirrors it to `localStorage`, and (when
  `shouldSyncToSupabase` is true) calls `syncTenantTable(table, tenantId, rows)`,
  which runs `toRow`/`fromRow` conversions (camelCase ↔ snake_case) against
  a generic `TenantTable` union covering every entity type, then
  upserts/deletes against Supabase.
- **Consequence**: two browser tabs on the same tenant do not see each
  other's writes live — there is no realtime subscription, only
  local-state-plus-eventual-Supabase-sync. A second device/tab requires a
  reload to see another session's changes.
- **RLS**: every tenant table has a `tenant_id` column and a Postgres
  Row-Level-Security policy restricting access to that tenant — this is the
  actual isolation boundary, not anything client-side.

---

## 7. Known gaps, fragile areas, and recent incidents (be skeptical here)

These are real, currently-true limitations — worth an auditor's specific
attention, not boilerplate caveats.

- **Industry-matching whitespace bug (fixed in v1.28.1, not yet confirmed
  resolved against live user data as of this writing)**: every industry
  comparison used to be an ad-hoc `.trim().toLowerCase()` duplicated across
  11+ call sites. `.trim()` doesn't collapse *internal* whitespace runs
  (e.g. a double space), and HTML visually collapses such runs when
  displaying ordinary text — so two Industry values could look
  byte-identical on screen while failing an exact-string match. Centralized
  into `src/lib/industryMatch.ts`'s `normalizeIndustry()`. **A live user
  report ("I added 2 businesses to Car Wash, they are not showing", and
  again "issue is persisting" after the fix was pushed) is still open as of
  this writing** — the whitespace theory is plausible but unconfirmed
  against the actual stored bytes; the user has not yet gotten browser
  DevTools or a Supabase query confirming the exact stored string.
  **An auditor should verify this is actually fixed, not assume the fix
  landed cleanly** — the retry after deploy still reproduced.
- **`Company.status` includes a literal `"Lead"` value.** A Company record
  can show a "Lead" status badge and still be a genuine, separate `Company`
  entity — do not assume a "Lead" badge means it's a `Lead`-type record;
  this caused a real false lead earlier in this project's history.
- **No way to see which businesses a campaign-less Playbook actually
  reaches, prior to v1.28.0** — fixed by the Matching Businesses panel, but
  the underlying "no audience picker, ever" design is intentional and will
  keep confusing new users; Instructions was rewritten to explain it
  explicitly but nothing enforces a user reading Instructions first.
  Consider: a first-run tooltip or modal the moment a user opens the
  Playbook create form for the first time.
  Editable Industry field: this
  did not exist before v1.28.0 — before that, an existing Lead/Company's
  Industry could only be set at creation time via import or the quick-create
  modal, with no way to correct it later short of deleting and recreating
  the record.
- **No bulk-select/bulk-action toolbar** on any list view (Leads, Contacts,
  Companies, Deals, Tasks, Invoices) — every action is per-record.
- **Lead import (`LeadImportModal.tsx`) is create-only** — it cannot update
  an existing record by matching an identifier; re-importing a file with
  updated data creates duplicates rather than updating in place.
- **No subtasks** on Tasks.
- **No AI Prompt Manager / Analysis Manager** — the prompts sent to
  `/api/ai/*` are hardcoded in `server.ts`, not tenant-configurable.
- **AI credit limits are fixed**, not tenant-configurable from the UI.
- **No campaign duplication** — an Email Campaign or Industry Playbook must
  be rebuilt from scratch rather than cloned and tweaked.
- **`atRiskCompanies` counts toward `Header.tsx`'s `totalAlerts` badge but
  has no rendered dropdown section** — the badge number can imply
  information that clicking through never actually shows.
- **Migration `0014_stored_files.sql`'s applied status on the live database
  is unconfirmed** as of this writing — worth an explicit check before
  relying on File Manager's Supabase-Storage-backed behavior in production.
- **OpenAI is not offered as an alternative AI provider** for email
  generation — the AI stack is whatever `server.ts` is currently wired to
  (check `@google/genai` in `package.json` — Gemini, not OpenAI, is the
  actual current provider despite occasional references to "OpenAI" in
  planning discussions).
- **Whether the live site auto-deploys on every push to `main` is a
  process fact this document cannot verify from the repo alone** — `vercel.json`
  implies Vercel git-integration auto-deploy, but this should be confirmed
  operationally (e.g. by checking the Vercel dashboard's deployment history
  against actual git pushes) rather than assumed, since at least one
  debugging session in this project's history was initially confused by
  exactly this uncertainty (a fix committed on the developer's machine was
  briefly mistaken for something already live).

---

## 8. How to extend this document

This file should be re-generated or hand-updated whenever a feature is
added, removed, or materially changed — it is not wired to auto-update from
the codebase. If it drifts from actual behavior, trust the code
(`src/types.ts`, `src/components/views/*`, `server.ts`) over this document,
and update this document to match rather than the reverse.
