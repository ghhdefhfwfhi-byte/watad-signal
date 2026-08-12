# Watad Signal — Hosted

Client vs competitors social-content dashboard. Owned accounts are pulled via Composio
and pushed to /api/ingest; competitors are public snapshots pushed the same way.

## Env vars (Railway → Variables)
- `INGEST_TOKEN`  secret protecting /api/ingest, /api (writes)
- `DATA_DIR`      set to a mounted volume path (e.g. /data) for persistence
- `PORT`          set by Railway automatically

## Endpoints
- `GET  /api/store`             full store for the UI
- `POST /api/clients`           { name, handle }  add owned client
- `POST /api/competitors`       { client, handle } add competitor
- `POST /api/ingest`            (Bearer INGEST_TOKEN) push owned+competitor posts

## Data pipeline (the "engine")
A scheduled job pulls each owned client's recent media via Composio Instagram
(INSTAGRAM_GET_IG_USER_MEDIA) and POSTs to /api/ingest. Competitors are captured
by a public snapshot run and POSTed the same way. Instagram gives no API for
accounts you don't own, so competitor data is public-only (no reach/saves).
