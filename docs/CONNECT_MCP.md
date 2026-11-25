# AarPex MCP connector and Connect API 1.1

Manage-and-read only. Nothing here sends email: campaigns are created as drafts and launched inside AarPex.

## Setup
1. Settings > API > create a key. Pick permissions (campaigns, import, export...). Keys are per workspace.
2. Copy the MCP URL (`https://aarpex.aarbook.com/api/mcp`) into your MCP client, with header `Authorization: Bearer agc_live_...`.

## REST (`/api/connect/v1`)
- `GET /summary` (leads:read)
- `GET/POST /campaigns`, `GET/PATCH/DELETE /campaigns/:id`, `POST /campaigns/:id/pause|resume|archive`, `GET /campaigns/:id/results[?include=recipients]`
- `POST /leads/import` body `{ rows:[...] | csv:"...", dry_run, on_duplicate:"skip"|"update", group_id }` (max 1000 rows)
- `GET /leads/export?format=json|csv&limit=&cursor=&status=&group_id=&updated_since=`

## Operations
Apply `supabase/migrations/0035_connect_rate_limits.sql` for database-backed rate limits.
