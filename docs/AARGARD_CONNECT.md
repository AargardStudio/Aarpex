# Aargard Connect - AarPex adapter (v1.0.0)

Status after the first pass (P002-P006). See `AARGARD_CONNECT_ASSESSMENT.md` for the architecture assessment and phase plan.
This is AarPex's own compatible integration layer. **Aargard Connect Core is not deployed, so nothing here is registered with, or tested against, a central service.**

## What works today
- Settings > Integrations > **API & Integrations**: Overview, API keys, Documentation.
- Workspace admins generate named keys (`agc_live_...`), pick permissions per resource, set an expiry, rotate, edit and revoke them. The key is shown once and only its SHA-256 hash is stored.
- Public API at `/api/connect/v1` for leads, deals, pipelines, tasks, activities and lead groups (list, get, create, update, delete).
- The existing Founder's Dashboard API (`/api/aargard-integration/v1`) is unchanged and still works; it is listed under "Connected applications".

## Endpoint inventory
| Method | Path | Scope |
|---|---|---|
| GET | `/health`, `/capabilities`, `/.well-known/aargard-connect` | none (public, non-sensitive) |
| GET | `/me` | any valid key |
| GET | `/{resource}`, `/{resource}/{id}` | `{resource}:read` |
| POST | `/{resource}` | `{resource}:write` (accepts `Idempotency-Key`) |
| PATCH | `/{resource}/{id}` | `{resource}:write` |
| DELETE | `/{resource}/{id}` | `{resource}:write` + `{"confirm": true}` |

Resources: `leads`, `deals`, `pipelines`, `tasks`, `activities`, `groups`. Browser-side admin routes (`/api/connect-admin/overview`, `/keys`, `/keys/:id`, `/keys/:id/rotate`, `/keys/:id/revoke`) require a signed-in workspace admin.

## Permission matrix
Scopes: `leads|deals|pipelines|tasks|activities|groups` x `read|write`. `write` implies the key can create, edit and delete, and the UI also grants `read`. There is deliberately **no** scope for team management, billing, settings, email or WhatsApp sending.

## Conventions
JSON only. Pagination `?page&per_page` (max 100) returns `pagination {page, per_page, total, has_more}`. Sort `?sort=created_at|updated_at&order=asc|desc`. Filters per resource plus `?q=` and `?updated_since=`. Errors `{ "error": {code, message}, "request_id" }`. Every response has `X-Request-Id`; rate-limit headers `X-RateLimit-Limit/Remaining/Reset` and `Retry-After` on 429. Unknown body fields are rejected (400). No CORS headers: keys are server-side only.

## Security controls implemented
Keys hashed (SHA-256) and shown once; tenant bound at the key; all queries filtered by tenant; foreign ids in bodies (pipeline_id, deal_id, lead_id, group_ids) must belong to the same workspace; scope checked on every route; expiry, rotation (old key dies at once) and revocation; per-key rate limit; audit log of every write and key lifecycle event (`connect_audit_logs`); per-day usage counts; RLS on with no policies on all `connect_*` tables.

## Database changes (`0031_connect_api.sql`, applied to the live project)
New tables only, nothing altered or dropped: `connect_api_keys`, `connect_audit_logs`, `connect_idempotency`, `connect_usage_daily`, and function `connect_usage_bump`.

## Environment variables (all optional)
`CONNECT_RATE_PER_MIN` (default 60), `CONNECT_MAX_KEYS` (active keys per workspace, default 10), `PUBLIC_APP_URL` / `APP_URL` (base URL shown in the Center).

## Testing report
Run against an in-memory mock of the database (38 checks, all pass): admin-only key management, bad scopes and names, key shown once and not stored, 401 for missing/invalid/revoked/expired keys, rotation kills the old key, scope enforcement, unknown and `tenant_id` body fields rejected, idempotent replay and conflict, cross-workspace references rejected, cross-workspace read/edit/delete blocked, `X-Business-Id` mismatch, delete confirmation, usage counting, no hashes in admin responses, JSON 404.
**Not yet tested:** against the live Supabase database and a deployed server (do a manual test after deploying: create a read-only key, call `/me` and `/leads`, confirm a write returns 403, revoke, confirm 401). Browser UI was type-checked, not click-tested.

## Known limitations / blocked
- Rate limiting is in memory per serverless instance (best effort); shared limiting is planned with P010.
- Webhook events on Connect writes reuse the Founder's Dashboard webhook sender (single endpoint per connection, 3 inline attempts). Self-service webhook endpoints, delivery history and replay are P009. Events for changes made in the AarPex UI still fire only while a browser tab is open.
- Only `live` keys exist; there is no sandbox data set, so `agc_test_` keys are intentionally not offered.
- Idempotency check-then-store has a small race window for two simultaneous identical requests.
- Not built: OpenAPI file, AI Integration Builder, Playground (P007-P008), OAuth/PKCE (P012), SDK (P013), cross-app sync (P011), central admin (P014), invoices/payments and messaging endpoints.
- Blocked on Aargard Connect Core: registration, central admin, OAuth issuer, cross-application sync.
- `tenants.plan` can be edited by workspace admins via RLS, so plan-based API limits would not be tamper-proof; no plan limits were added.

## Deployment
1. Migration 0031 is already applied; re-running it is safe.
2. Push, let Vercel deploy. Optionally set `CONNECT_*` variables.
3. Smoke test as described above. Rollback: revoke keys in the UI, or revert the commit; the new tables are inert without the code.

## Customer guide
1. Settings > Integrations > API & Integrations > API keys > **Generate API key**.
2. Name it, tick what it may do, choose an expiry, click Generate, copy the key.
3. Store it as a server-side secret (`AARGARD_CONNECT_API_KEY`) in your website backend, Zapier/n8n or AI tool; call `https://aarpex.aarbook.com/api/connect/v1/...` with `Authorization: Bearer <key>`.
4. To stop access at any time, Revoke it. If a key leaks, Rotate or Revoke immediately.
