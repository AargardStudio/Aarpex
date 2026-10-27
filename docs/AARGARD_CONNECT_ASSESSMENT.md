# Aargard Connect - AarPex Technical Assessment (P001) and Plan

Status: discovery only. No code has been changed for Aargard Connect yet.

## 1. Which application is this
**AarPex** (CRM, pipeline, invoicing, WhatsApp/email outreach, Sales Intelligence). Repo AargardStudio/Aarpex, v2.17.4.

## 2. Architecture found
| Item | Finding |
|---|---|
| Stack | React 19 + Vite + TypeScript + Tailwind; one Express server (`server.ts`, ~5,600 lines) deployed as a Vercel function; Netlify proxies aarpex.aarbook.com to Vercel |
| Database | Supabase Postgres (project kjczjodwaikbkbljfhej). 27 tables incl. tenants, tenant_members, companies, contacts, leads, pipelines, deals, invoices, payments, activities, tasks, products, audit_log, whatsapp_messages, lead_groups |
| Auth | Supabase Auth (JWT). Server resolves `req.userId`; tenancy via `tenant_members` and the `X-Tenant-Id` header |
| Multi-tenancy | Workspace = `tenants` row; RLS on tables; the server uses the service-role key and checks membership itself |
| Roles | admin, sales_manager, sales_rep, finance, viewer, custom (+ permission flags) |
| Subscriptions | Stripe Payment Links; plan stored on `tenants.plan` (Growth 5 seats, Pro 10, Enterprise). Server gate `tenantHasIntelligence` already exists and can be reused for API entitlements |
| Existing machine API | `integrationApi.ts`: `/api/aargard-integration/v1/*` for Founder's Dashboard (about 45 endpoints: deals, leads/contacts, pipelines, tasks, activities, groups, users, summary, activity feed). Admin side: `/api/integration-admin/*` |
| Existing credentials | `integration_connections`: SHA-256 hashed API key, hashed single-use setup token, webhook secret + URL, status, last_used_at, revoke and rotate. RLS on with no policies (server-only) |
| Existing webhooks | Signed (HMAC-SHA256), 3 attempts with short backoff, https-only URL check with private-range block, events `aarpex.*` |
| Existing audit | `integration_audit` (every API write), `audit_log` (app-level) |
| Rate limiting | 60 req/min/connection, in-memory per server instance (not shared across serverless instances) |
| Logging | console only; no request IDs, no usage metering |
| Background jobs | Vercel cron `/api/cron/agent-scan` only; no queue (webhook retries run inline) |
| API docs | Markdown only (`docs/FOUNDERS_DASHBOARD_INTEGRATION.md`); no OpenAPI |
| SDKs | none |
| Other integrations | Stripe, WhatsApp (Meta), SMTP/IMAP webmail, Gemini AI, Supabase Storage |
| Env vars | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, APP_URL/PUBLIC_APP_URL, STRIPE_*, SMTP_*, META_*, INTEGRATION_ALLOWED_ORIGINS |
| UI | Settings has an "Integrations" section with the Founder's Dashboard card (`FounderDashboardCard.tsx`) |

## 3. Reusable vs missing
Reusable as-is: key hashing and generation pattern, connection lifecycle (rotate/revoke), HMAC-signed webhook sender, SSRF URL check, audit table, tenant-membership checks, plan gate, Settings > Integrations shell, CORS allow-list.

Missing for Aargard Connect:
1. Multiple keys per workspace with names, scopes, expiry, `test`/`live` environments (today: one connection per Dashboard handshake, scopes are only read/write/users and hard-coded).
2. Granular scopes (`leads:read`, `deals:write`, ...) enforced per endpoint.
3. `/api/connect/v1` public contract with request IDs, rate-limit headers, filtering, sorting, idempotency keys.
4. Usage metering and analytics (requests, errors, latency); durable shared rate limiting.
5. Webhook endpoints as a first-class resource (multiple endpoints, event selection, delivery history, retry/replay UI, secret rotation, replay protection).
6. OpenAPI spec generated from the capability registry; AI Integration Builder; API Playground.
7. OAuth 2.0 + PKCE, MCP/agent identities, central registration with Connect Core.
8. Full API & Integrations Center UI.

## 4. Capability registry (only what exists and works today)
Backed by working code in `integrationApi.ts` and the tables above:

| Module | Operations available now | Proposed scopes |
|---|---|---|
| Leads (also served as /contacts) | list, get, create, update, delete, filter by group/status/q | `leads:read`, `leads:write` |
| Deals | list, get, create, update, delete, move stage, assign, bulk update | `deals:read`, `deals:write` |
| Pipelines and stages | list, get, create, update, delete | `pipelines:read`, `pipelines:write` |
| Tasks | list, get, create, update, delete, complete | `tasks:read`, `tasks:write` |
| Activities | list, get, create, update, delete | `activities:read`, `activities:write` |
| Lead groups | CRUD | `groups:read`, `groups:write` |
| Summary / activity feed | KPIs, change feed | `analytics:read` |
| Team users | list, invite, role change, remove | `users:manage` (admin-only, high-risk) |
| Industry agents / approvals | read-only | `agents:read` |

Not registered (no API-suitable backend yet): invoices and payments (Stripe-linked, UI-driven), companies as an entity separate from leads (tables exist; the existing API treats leads as the single record, so this needs checking before exposing), workflows, WhatsApp/email sending (high-risk; would require explicit approval scopes).

Webhook events supported today: `lead.created/updated/deleted`, `deal.created/updated/stage_changed/won/lost/deleted`, `task.created/updated/completed/deleted`, `activity.*`. Caveat: changes made in the AarPex UI emit events only while a browser tab is open; server-side event emission is a required fix for reliable webhooks (P009).

## 5. Decisions (to keep from creating a conflicting platform)
1. **Extend, don't duplicate.** `/api/connect/v1` becomes the standard contract, implemented on the same handlers as `/api/aargard-integration/v1`. The Founder's Dashboard v1 routes stay untouched (frozen contract) and keep working.
2. **Credentials:** add a new `connect_api_keys` table (name, prefix, hash, scopes, environment, expiry, last_used, revoked, created_by) for the new multi-key model. Existing `integration_connections` remain valid; Dashboard connections are shown in the Center as a "Founder's Dashboard" connection and map to a fixed scope set.
3. **Key format:** `agc_live_` / `agc_test_` + 32 random bytes base64url; only SHA-256 hash and a short display prefix stored; shown once.
4. **Shared state** (rate limits, usage, delivery queue) moves to Supabase tables, since Vercel instances are stateless.
5. **Central dependency:** Aargard Connect Core does not exist yet. We build a local adapter with a documented registration contract (`GET /api/connect/v1/.well-known/capabilities` returning app id, version, scopes, events) and mark Core registration, central admin and cross-app sync as blocked until Core exists.
6. Nothing here is deployed automatically; every phase ends as a local commit for your review.

## 6. Phase plan (this repo)
| Phase | Work | Needs Core? |
|---|---|---|
| P001 | This assessment | no |
| P002 | Compatibility contract: capabilities endpoint, scope catalogue, error and pagination standard, request IDs | defines it |
| P003 | `connect_api_keys` migration, key generation/rotate/revoke/expiry, auth middleware, audit | no |
| P004 | Scope enforcement per endpoint, tenant isolation tests, plan entitlement via `tenants.plan` | no |
| P005 | Settings > API & Integrations: Overview, API Keys, Connected Apps | no |
| P006 | `/api/connect/v1` resource endpoints over leads, deals, pipelines, tasks, activities, groups | no |
| P007 | OpenAPI JSON generated from the capability registry; docs tab | no |
| P008 | AI Integration Builder + Playground | no |
| P009 | Webhook endpoints, delivery table, server-side event emission, retries, replay, secret rotation | no |
| P010 | Usage metering and analytics | no |
| P011 | Cross-app connections (AarBook, Aargo, Founder's Dashboard) | yes, partly blocked |
| P012 | OAuth 2.0 + PKCE | needs Core as issuer |
| P013 | SDK (generated from OpenAPI) | no |
| P014 | Central admin hooks | blocked |
| P015 | Security review and integration test run | no |

Recommended first tranche: P002 to P006 (secure keys, scopes, working API, Center UI), then P007 to P010.

## 7. Risks to be aware of
- `tenants.plan` is editable by workspace admins via RLS today, so plan-based API limits are not tamper-proof until that is locked down.
- In-memory rate limiting does not hold across Vercel instances; P010 fixes it.
- UI-originated webhook events depend on an open browser; P009 fixes it.
- Vercel Hobby limits (function count/time) constrain long-running retries; retries need the cron or a queue table.
