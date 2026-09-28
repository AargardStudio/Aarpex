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

## [2.0.1] - 2026-09-28

### Fixed
- **Leads and Deals kanban cards overflowed horizontally, producing a mismatched native scrollbar and a "Convert" button that visually collided with the status dropdown at the card's edge.** Each card's footer packed up to five controls (Analyze, Email, WhatsApp, Convert, the status select) into one non-wrapping flex row -- wider than the card at the kanban board's narrower breakpoints. `overflow-y-auto` on the scrolling cards container with no `overflow-x` specified computes to `overflow-x: auto` per the CSS spec, so the browser's own (light, theme-mismatched) scrollbar appeared rather than the app's dark `custom-scrollbar` styling. Footer now wraps (`flex-wrap`) instead of overflowing, the status select has a max width, and both cards containers set `overflow-x-hidden custom-scrollbar` explicitly so only the intended dark vertical scrollbar ever shows.

## [2.0.0] - 2026-09-28

### Removed
- **Companies and Contacts have been removed entirely, ahead of a from-scratch rebuild of both on a proper data model.** This is a deliberate, approved, breaking change -- not a bug fix. A full backup of all 1,284 companies and 976 contacts was exported and handed to the workspace owner before anything was touched.
- Live Supabase migration `0019_drop_companies_contacts.sql` drops every foreign key pointing at `companies`/`contacts` from `activities`, `deals`, `invoices`, `leads`, `payments`, and `tasks`; drops the now-orphaned id columns those tables held (`company_id`, `contact_id`, `converted_company_id`, `linked_company_id`, `linked_contact_id`, and the plain (non-FK) `agent_actions.contact_id`, `industry_agents.excluded_company_ids`, `knowledge_base.linked_company_ids`/`linked_contact_ids`, `stored_files.linked_company_id`/`linked_contact_id`); then drops the `companies` and `contacts` tables themselves.
- The Companies and Contacts pages, their sidebar nav entries, and the `Company360Drawer`/`ContactProfileDrawer` components are gone from the app. `CRMContext` no longer holds companies/contacts state or CRUD, and `tenantDataSync` no longer syncs either table.

### Changed
- Every feature that linked to a Company or Contact record now works without one, rather than pointing at nothing: Deals, Invoices, Payments, Tasks, and Activities no longer have a company/contact link (Invoice "Billed To" now shows the linked Deal, falling back to "Corporate Account"); the AI Sales Copilot can no longer create/update/delete Contacts or Companies and its negotiation-offer/personalized-email actions are lead-only now; the AI chat-assistant's action schema (`server.ts`) drops the `contact`/`company` entities and the `companyRef`/`contactRef` fields, so deal/invoice creation through chat no longer requires (and can no longer fail on) an unresolvable company; Knowledge Base entries link to Leads only; Industry Agent matching is lead-only (its "Companies" match count always reads 0 now); Email Marketing's audience is Leads-only; Lead conversion creates a Deal only; and Reports/Revenue roll up by Lead and Deal rather than Company.
- `QuickCreateModal` and `EntityImportModal` no longer offer Company/Contact as a record type to create or bulk-import.
- LeadsView's "Sync All to Companies/Contacts" bulk-link action was removed along with the tables it linked to.

### Notes
- This is a MAJOR version bump because it removes user-facing functionality and a chunk of the data model, not because anything was broken. The Companies/Contacts backup (JSON) was delivered directly to the workspace owner; it is not stored in this repo.

## [1.33.0] - 2026-09-28

### Changed
- **Removed three header buttons to cut clutter: "Access & Roles", "Billing", and "Sign In / Up".** Neither Access & Roles nor Billing is a frequent action, and both remain reachable -- Access & Roles from Settings, Billing from Settings -> Subscription and the "Settings & Billing" link in the footer. The "Sign In / Up" trigger was removed outright: it rendered even for an already-signed-in user, sitting directly beside their own name and Sign Out button, which read as a bug rather than an action.

## [1.32.6] - 2026-09-28

### Fixed
- **Duplicate ids in local state failed an entire table's sync with a 500.** Postgres refuses an `on conflict do update` whose batch touches the same row twice (`ON CONFLICT DO UPDATE command cannot affect row a second time`) -- which surfaces as a 500 from PostgREST rather than a 400, failing the whole chunk. Local state can legitimately hold two entries under one id: a lead converted to a company twice, a re-import that re-adds an existing record, or a merge that didn't drop its source row. `performSync` now collapses duplicates by id before upserting, keeping the last occurrence (matching the app's own precedence), and logs a warning naming the table and count so the underlying duplication is still visible rather than silently papered over.

## [1.32.5] - 2026-09-28

### Fixed
- **Records with non-uuid ids can now sync -- closing the silent partial-sync gap flagged in v1.32.2.** AarPex generates ids with `crypto.randomUUID()` in newer code paths but falls back to prefixed strings elsewhere (`prod_<ts>_<rand>`, `file_<ts>_<rand>`, `agt_<ts>_<rand>`, `usr_<ts>`, `lead_imp_<ts>_<i>`, `comp_<ts>_<rand>`). A `uuid` column rejects every one of those outright, and because `upsertRowsResilient` retries a failed chunk row-by-row, the valid rows saved while the rest were quietly dropped. New `supabase/migrations/0018_widen_remaining_uuid_ids_to_text.sql` widens the last four tables still keyed by uuid -- `products`, `stored_files`, `industry_agents`, `agent_actions` -- to text.
- Two of the columns fixed here were not merely inconvenient but impossible to populate, because they reference tables whose ids are already text: `stored_files.linked_company_id`/`linked_contact_id`/`linked_deal_id`/`linked_lead_id`, and `comments.user_id` (which holds the `usr_<ts>` ids that User Access Control assigns). No valid value could ever have been stored in them.
- Every id keeps its existing value -- `id::text` on a uuid yields the same canonical string -- so nothing was re-keyed and every existing reference remains valid. Row counts were verified unchanged before and after.

### Notes
- Most of the schema had already been moved to text ids before this release; these four tables were what remained. Worth recording that the migration files in `supabase/migrations/` had drifted substantially from the live database by this point, so the live schema -- not the files -- was the source of truth for what still needed changing. The same drift is what produced the missing columns repaired in v1.32.2.
- Partial-sync failures were never entirely undetected: `onSyncFailure` already records them to the workspace audit log. They simply aren't surfaced anywhere a user would notice, which made them feel invisible. Surfacing them in the UI remains open.

## [1.32.4] - 2026-09-28

### Fixed
- **"Approve & Send" could report a message as sent when nothing was relayed.** `/api/webmail/send-email` answers `success: true` in two very different situations: a real SMTP dispatch, and simulation mode when the workspace has no SMTP password saved (where it invents a `messageId` and sends nothing). The Agent Approvals path only checked `success`, so a simulated send was logged to the record's timeline as "Delivered" and the queued item was marked approved -- producing a queue full of messages nobody ever received. Simulation now also returns `simulated: true`, its `message` says plainly that nothing was sent, and the client treats it as a failure that leaves the item pending with an explanation instead of silently "approving" it.
- **Recipient addresses are normalized and validated before they reach the mail server.** Addresses come from imported/scraped record data, and in practice carry trailing newlines (`info@example.com\n`), trailing spaces, or aren't addresses at all (one queued action's recipient was the single character `x`). Passing those to nodemailer produced an opaque `No recipients defined` that surfaced as a generic "check your mailbox connection" -- pointing at the mailbox when the mailbox was fine and the address was the problem. `to`/`cc`/`bcc` now accept a string, a comma/semicolon-separated list, or an array; each address is trimmed and shape-checked; and a rejected send names the exact offending address. An address containing a newline is also a header-injection vector, so it must never reach the SMTP envelope untouched.
- **A send is now only reported as successful if the mail server actually accepted a recipient.** An SMTP server can accept the connection and still reject individual recipients, so "nodemailer didn't throw" was being treated as delivery. The response now carries `accepted`, `rejected`, and the raw `smtpResponse`, and a send where every recipient was rejected returns an error instead of success.
- Cleaned the stored data this was corrupting: trailing whitespace/newlines trimmed from `recipient_email` on queued agent actions and from `email` on leads, contacts, and companies. Addresses themselves were not otherwise altered.

## [1.32.3] - 2026-09-28

### Fixed
- **The remaining reason records silently stopped saving -- a single client-library default, not a schema problem.** `postgrest-js` builds an insert's column list as the *union* of the keys across every row in a batch, and unless told otherwise it writes an explicit `NULL` into any column a given row happens to be missing. `tenantDataSync`'s `toRow()` omits keys whose value is `undefined`, so batches are routinely heterogeneous -- one Industry Agent has `excludedLeadIds` and the next doesn't; one Knowledge Base entry links leads while the next links contacts. Every row missing a key another row supplied therefore got `NULL` instead of the column's `DEFAULT`, which hard-fails against any `not null` column (`null value in column "linked_contact_ids" of relation "knowledge_base" violates not-null constraint`). Because `upsertRowsResilient` retries a rejected chunk row-by-row, one heterogeneous batch took down every row in it -- so the table simply stopped saving, with no user-visible sign.
- Both upsert calls now pass `defaultToNull: false`, which sends `Prefer: missing=default` and tells PostgREST to apply each column's `DEFAULT` for keys a row didn't supply. That is what the sync has always meant: an absent field means "leave it at the default", never "write NULL over it".
- New `supabase/migrations/0017_relax_not_null_array_columns.sql` drops `not null` from the array columns a sync row may legitimately omit (`knowledge_base.tags`/`linked_lead_ids`/`linked_contact_ids`/`linked_company_ids`, `industry_agents.talking_points`/`pain_points`/`excluded_lead_ids`/`excluded_company_ids`, and `tags` on companies/leads/contacts), keeping their defaults. This is belt-and-braces for any browser still running a cached build that predates the fix above; every consumer of these fields already treats null and `[]` identically.

### Notes
- This and the v1.32.2 schema repair are two independent faults with the same symptom, which is why fixing the columns alone didn't fully resolve it: v1.32.2 was columns that never existed, this is existing columns being sent `NULL` they should never have received.

## [1.32.2] - 2026-09-27

### Fixed
- **Schema drift repair -- the actual root cause of Industry Agents, Agent Approvals, and several other things silently not saving.** `tenantDataSync.ts`'s `toRow()` is fully mechanical: it snake_cases *every* field present on an app object and writes it to that entity's Supabase table. Nothing links `src/types.ts` to the real database schema, so any field added to an interface silently starts being written -- and if no migration ever added the matching column, PostgREST rejects **the entire row**, not just the unknown field. One missing column therefore breaks persistence for a whole table while the UI still looks correct, because the local React/localStorage write succeeds.
- Audited every synced table by diffing each TypeScript interface against the columns the migrations actually create, then verified the result against the live database. Eleven columns were being written but had never been created. New `supabase/migrations/0016_schema_drift_repair.sql` adds them all:
  - `industry_agents`: `product_id` (added with product linking in v1.27.0), `excluded_lead_ids` and `excluded_company_ids` (added with the Matching Businesses opt-out checkboxes in v1.28.0) -- these three are why Industry Agents could not save at all, so any agent beyond the first vanished on reload.
  - `companies`: `client_category`. `leads`: `client_category`, `social_links`. `activities`: `lead_id`. `knowledge_base`: `linked_file_id`.
- **Agent Approvals now save.** `agent_actions.lead_id`/`contact_id`/`product_id` were declared `uuid`, but the ids written to them are app record ids that are frequently not uuids (bulk-imported leads get ids shaped like `lead_imp_<timestamp>_<index>`), so Postgres rejected the insert outright (22P02) and the table sat permanently empty. None of the three are foreign keys, so they are now `text`.

### Notes
- Known remaining issue, deliberately not bundled into this release: every synced table still declares `id uuid primary key`, while `importLeadsFromSpreadsheet`, lead-to-company conversion, `addActivity`, `addTask`, `addComment`, and `addPipeline` all generate non-uuid text ids -- so those specific records can never sync regardless of which columns exist (visible as `tasks` sitting at 0 rows and `activities` at 4). Newer code paths correctly use `crypto.randomUUID()`. Resolving it means either widening those id columns to text or switching the app to uuids everywhere and remapping existing local ids plus every cross-reference pointing at them -- an architectural call with real data-migration consequences.
- `public.email_campaigns` is altered by migrations 0004 and 0005 but is never created by any migration in the repo; it exists in the live database, so it was created outside this directory and its shape can't be verified from source control.

## [1.32.1] - 2026-09-27

### Fixed
- **Root-caused the long-standing "Car Wash businesses not appearing" bug** (and the same failure for any manually-typed Industry, confirmed to reproduce with a freshly created "FNB" agent too): a value typed by hand into an Industry field -- an Industry Agent's own Industry, or a Lead's/Company's -- could pick up an invisible, non-whitespace Unicode character (from an input method, a browser extension, or a paste) that ordinary `.trim()` never strips, while a value chosen from an existing-value chip or a dropdown never had the problem. That's exactly the pattern reported: the default/picked "General" industry matched fine, but anything typed by hand into Car Wash, FNB, or any other custom industry silently matched zero businesses even though the text looked identical on screen.
- `normalizeIndustry()` (`src/lib/industryMatch.ts`, the one shared comparison used everywhere an Industry Agent decides who it applies to) now also strips that class of invisible characters and applies Unicode NFKC normalization before comparing, on top of the existing trim/lowercase/whitespace-collapse.
- New `sanitizeIndustryText()` applies the same cleanup **at save time**, not just at comparison time, so a stray invisible character never makes it into a stored record in the first place. Wired into every place a person types a custom Industry by hand: the Industry Agent create/edit form, editing a Lead's or Company's Industry from their profile drawer, and Quick Create's "Other" industry field for both Leads and Companies.

## [1.32.0] - 2026-09-27

### Changed
- **AI provider keys for Industry Agents are now platform-wide, not per-tenant.** Reversed the v1.31.0 design: instead of each workspace bringing its own OpenAI/Gemini key, Aargard provides one shared key per provider (`GEMINI_API_KEY` / `OPENAI_API_KEY`) used by every tenant -- the same model as every other AI feature in AarPex. Removed the per-tenant "AI Provider Keys" Settings tab and the `ai_provider_configs` tenant column added in the previous release; an agent's own provider/model choice is unaffected, only where the credential comes from changed.

### Added
- Industry Agents now **actually route their drafts through the provider/model each one is set to** (email-campaign, lead-analysis, personalized-email, and negotiation-offer) instead of always using the platform's shared Gemini integration regardless of what was selected -- the gap flagged as a known limitation in v1.31.0 is now closed for these four AI calls.
- `/api/health` and `/api/env-check` now also report whether `OPENAI_API_KEY` is configured on this deployment, matching the existing `GEMINI_API_KEY` check.

### Fixed
- Corrected the Gemini model ids offered in an Industry Agent's model dropdown (`gemini-2.5-flash`/`gemini-2.5-pro` didn't match any model this deployment's Gemini integration actually calls) to the same ids/fallback order already used elsewhere (`gemini-3.1-flash-lite`, `gemini-3.8-flash`).

## [1.31.0] - 2026-09-27

### Changed
- **Industry Playbooks is now Industry Agents** -- a full rename and rebuild of the same feature (Phase 1 of the "Industry AI Agents" build spec), not a new parallel feature. Existing Playbook data migrates in place with zero loss: the underlying `industry_playbooks` Supabase table is renamed to `industry_agents` (columns kept, `negotiation_guidance` renamed to `negotiation_conditions`), and a tenant's existing local data is picked up automatically from the old localStorage key on first load after upgrading. "Industry Playbooks" is renamed to "Industry Agents" throughout the sidebar, Dashboard, Instructions, Agent Approvals, chat assistant, and every AI prompt that referenced it.
- Matching Businesses, exclusions, monitoring status, activity feed, and pending-approvals -- everything already working in the redesigned Industry Playbook UI (v1.30.0/v1.30.1) -- carries over unchanged in behavior, just re-pointed at the renamed Industry Agent.

### Added
- Each Industry Agent now has its own **AI provider and model** (Google Gemini or OpenAI; a short curated model list per provider) instead of always using the platform's shared Gemini key.
- New **tenant-level AI Provider Keys** section in Settings: each workspace brings its own OpenAI and/or Gemini API key (one shared key per provider, used by every Industry Agent on that tenant configured to use it) -- the same "you bring your own credential" model already used for Stripe and webmail, extended to AI.
- Each Industry Agent now has a **scan frequency** field (how often it checks for due work, 15-minute minimum) and a **negotiation conditions** field (renamed from "negotiation guidance" for clarity) -- both were previously implicit or missing.
- New `supabase/migrations/0015_industry_agents.sql`: renames the table losslessly, adds the new columns, and adds tenant-level `ai_provider_configs` storage.

### Notes
- This is Phase 1 of 3 of the Industry Agents rebuild. Phase 2 (a real server-side scheduler via Vercel Cron, replacing the client-side browser-tab-dependent scan) and Phase 3 ("Analyze online presence," lead-level conversation forking, and the extended Knowledge Base approval queue) are tracked separately and not yet built. Actually routing an agent's drafts through its selected provider/model (rather than the shared platform key) is part of that same follow-up work -- for now, selecting a provider/model and saving its key is fully wired up and persisted, but every agent still drafts through the existing platform Gemini integration under the hood.

## [1.30.1] - 2026-09-26

### Fixed
- Industry Playbook "pick a value already used on your records" chip list was a fixed top-12-by-count ranking, not a search -- so a real, low-count industry (e.g. 2 businesses tagged "Car Wash") could be invisible behind whatever industry has the most records overall (often a bulk-import default like "General" applied to hundreds of Leads). It now actually searches: once you've typed something, the list filters to values containing what you typed instead of ranking by volume.

## [1.30.0] - 2026-09-26

### Added
- Industry Playbooks were redesigned so a first-time user can understand the whole model without opening Instructions:
  - A "Who will this Playbook reach?" summary (matching count, broken down by Leads/Companies) is now visible before you activate anything.
  - A plain "How this Playbook works" flow (Match -> AI prepares an action -> You approve -> AarPex sends) is shown right inside the Playbook, with an explicit statement that AarPex never sends AI-generated outreach without your approval.
  - A "Ready to activate" summary appears before creating a new Playbook (industry, matching count, excluded count, linked product, monitoring on/off).
  - Editing an existing Playbook now shows a real "Monitoring status" section: whether it's currently checking, when it last actually checked, and an honest "browser monitoring" label (never a false "always on") since this still depends on a browser tab being open -- there's no server-side scheduler yet.
  - That same section shows this Playbook's own pending-approval count (with a one-click jump to Agent Approvals) and its last 5 agent activity entries with plain-language reasoning.
  - Matching Businesses now has search and an All/Companies/Leads filter, and every row explains why it's included via a tooltip comparing the exact Industry text on both sides.
  - Changing a saved Playbook's Industry now shows a "change audience?" warning comparing the old vs. new matching count before you save.
  - Pausing an active Playbook (renamed from "Inactive" to "Paused" throughout) now asks for confirmation and explains that pending approvals are unaffected; Playbook cards also get a one-click Pause/Resume action and a pending-approvals shortcut.
  - A dismissible "Automate outreach by industry" explainer appears the first time Industry Playbooks is opened.
  - An inline warning appears when no mailbox is connected, since a Playbook can prepare actions but can't send anything approved until email is set up.

### Changed
- "Autonomous Agent" section relabeled "Automated Monitoring" and its toggle now reads "Monitoring: On/Off" instead of "Auto-run" -- same setting, plainer language throughout, matching Agent Approvals' existing "Approve & Send" wording.

## [1.29.0] - 2026-09-26

### Added
- Industry Playbook form: a "pick a value already used on your records" quick-select under the Industry field, sourced live from your actual Leads/Companies. Clicking one fills the field with the exact stored string, so it's guaranteed to match -- no more retyping an industry from memory and hoping it lines up byte-for-byte.
- When a typed Industry has zero matches, the Matching Businesses panel now checks for existing values that are close but not identical (a stray character, different wording/capitalization) and offers them as one-click "did you mean" suggestions, so a near-miss is fixable in one click instead of a guessing game.

## [1.28.1] - 2026-09-26

### Fixed
- Industry matching (Playbooks' "Matching Businesses" list, autonomous agent scanning, and the Industry Playbook lookup used on Lead/Contact profiles) now normalizes whitespace before comparing Industry text, not just trim + lowercase. Previously, a Lead or Company whose Industry contained a double space or other extra internal whitespace (invisible on screen -- HTML collapses it visually, so it looked identical to the Playbook's own Industry value) would silently fail to match and be excluded from its playbook. All industry comparisons across the app now go through one shared helper so this can't drift out of sync again.

## [1.28.0] - 2026-09-26

### Added
- Industry is now an editable field on existing Leads and Companies (previously only settable at creation time) -- click the pencil icon next to Industry in a Lead's or Company's profile to set or change it any time, no spreadsheet re-import required.
- Industry Playbooks now show a "Matching Businesses" list right inside the create/edit form: every Lead and Company whose Industry currently matches, live, with a checkbox to opt specific ones out of that playbook's AI agent without changing their Industry field. Playbook cards now show how many are excluded.
- Instructions page: rewrote the Industry Playbooks and "Running an AI-Agent-Managed Campaign" sections to explain, step by step, that a Playbook has no audience-picker screen like a campaign does -- it works by Industry-field matching -- and exactly how to get a business included (set its Industry, then optionally review it in the Playbook's Matching Businesses list).

## [1.27.0] - 2026-09-26

### Added
- Industry Playbooks can now be tied to a specific Product/Service (optional, same picker style as the Email Marketing campaign wizard). The linked product's name shows on the playbook's card.
- When a playbook has a linked product, every follow-up, reply, and negotiation draft its autonomous agent generates now centers on that specific product/pitch instead of speaking generically -- matching how a manually-built campaign already seeds its copy from a chosen product.

## [1.26.1] - 2026-09-26

### Added
- "Getting Started" checklist on the main Dashboard -- a very simple, ordered step-by-step card (add a company, add a contact, create a deal, optionally turn on a playbook, allow notifications) with live checkmarks and a one-click link into the full Instructions page. Dismissible; remembered per browser.
- Instructions page: new "Getting Started (baby steps)" section (opens first by default) and a new "Running an AI-Agent-Managed Campaign" section walking through Industry Playbooks -> auto-run -> Agent Approvals end to end.

### Fixed
- Industry Playbooks: the "Talking points" and "Common pain points" comma-separated inputs would silently eat the comma the moment you typed it, because the field's displayed value was being re-derived from the parsed array on every keystroke (which drops empty/trailing segments). These fields now keep their own raw text while typing and only sync to the underlying list, so commas type normally.

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
