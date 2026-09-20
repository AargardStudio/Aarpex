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
