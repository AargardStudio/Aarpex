# AarPex -> Aargard Founder's Dashboard integration (v1)

Hand-back for spec section 9. All paths are under the base URL
`https://aarpex.aarbook.com/api/aargard-integration/v1` (HTTPS only).

## 1. Connect (Hamza, once)
1. AarPex -> Settings -> Integrations -> **Create setup token** (workspace admins only).
2. Give the Dashboard team the **Base URL** and the **setup token** (single use, expires in 24h).
3. The Dashboard calls `POST /connections` with `{ "setup_token": "...", "webhook_url": "https://<dashboard>/api/integrations/aarpex/webhook" }`
   and receives `{ api_key, webhook_secret, business_id, scopes }` (shown once).
4. Every later call sends `Authorization: Bearer <api_key>`.

`GET /health` (no auth) -> `{ "status": "ok", "version": "1.0" }`

## 2. Implemented

| Area | Endpoints |
|---|---|
| Lifecycle | `GET /health`, `POST /connections`, `GET /connections/verify`, `POST /connections/rotate`, `POST /connections/revoke` |
| Overview | `GET /summary` (5 KPIs + alerts), `GET /activity?since=&limit=` |
| Deals | `GET /deals`, `GET /deals/:id`, `POST /deals`, `PATCH /deals/:id`, `DELETE /deals/:id`, `POST /deals/:id/move {stage_id,pipeline_id?}`, `POST /deals/:id/assign {salesperson}`, `POST /deals/bulk-update {ids,updates}` |
| Contacts (= leads; AarPex has no separate contacts/companies) | `GET/POST /contacts`, `/leads` (aliases), `GET/PATCH/DELETE /contacts/:id` (`/leads/:id`); filter `?group_id=&status=&q=` |
| Pipelines | `GET /pipelines`, `GET /pipelines/:id`, `POST/PATCH/DELETE`, `GET /pipeline-stages` |
| Tasks | `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id`, `POST /tasks/:id/complete` |
| Activities | `GET/POST /activities`, `GET/PATCH/DELETE /activities/:id` |
| Groups | `GET/POST /groups`, `GET/PATCH/DELETE /groups/:id` |
| Read-only extras | `GET /industry-agents`, `GET /agent-approvals?status=pending` |
| Users | `GET /users`, `POST /users/invite`, `PATCH /users/:id {role}`, `DELETE /users/:id` |

Lists: `?page=&per_page=` (max 100), newest first, `{ data, page, per_page, total, has_more }`.
Every record has `id`, `created_at`, `updated_at` (activities and pipelines have no edit timestamp, so `updated_at` = `created_at`).
Lists and details return the same fields. Field names are AarPex's own database column names (snake_case).

## 3. Control rules
- Writes accept only whitelisted columns; unknown fields are ignored; `tenant_id` can never be set.
- POST/PATCH/actions return the full updated entity. Repeating a move/assign/complete/delete is a clean no-op.
- Destructive calls (`DELETE`, `DELETE /users/:id`, `POST /users/invite`) require `{ "confirm": true }`.
- The last workspace admin cannot be demoted or removed.
- Every write is recorded in AarPex's `integration_audit` table (shown in Settings -> Integrations) as
  "<Hamza> via Founder's Dashboard".
- Errors: `{ "error": { "code", "message" } }` with 400/401/403/404/409/429/5xx.
- Rate limit: 60 requests/minute/connection (429 + `Retry-After`).

## 4. Webhooks (push)
`POST <webhook_url>` one event per request, `X-Aargard-Signature: sha256=<hex HMAC-SHA256 of the raw body, key = webhook_secret>`,
`{ "event", "business_id", "data", "occurred_at" }`. Up to 3 attempts over ~10s; `/activity` is the fallback.
Events: `aarpex.lead.created`, `aarpex.deal.created`, `aarpex.deal.updated`, `aarpex.deal.stage_changed`, `aarpex.deal.won`,
`aarpex.deal.lost`, `aarpex.deal.deleted`, `aarpex.task.completed`, plus `.created/.updated/.deleted` for leads, tasks, activities
changed through this API. Events from changes made inside AarPex itself are sent while a user has AarPex open.

## 5. Not in this first pass / differences from the spec
- No Companies or Contacts entity exists in AarPex; `/contacts` is the leads table.
- Webhooks for changes made in the AarPex UI are sent by the browser, so they fire only while someone has AarPex open;
  poll `/activity` to catch the rest.
- `/v1` is the only version. Rate limiting is per server instance (best effort).
