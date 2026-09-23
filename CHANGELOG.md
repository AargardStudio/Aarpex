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
