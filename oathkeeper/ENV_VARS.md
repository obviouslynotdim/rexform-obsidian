# Oathkeeper — Environment Variables

## Railway service: oathkeeper

Set these on the **Oathkeeper** Railway service.

| Variable | Example value | Notes |
|---|---|---|
| `KRATOS_PUBLIC_URL` | `https://rexform-kratos-production.up.railway.app` | Oathkeeper calls this to validate sessions |
| `NEXTJS_URL` | `https://rexform-notes-production.up.railway.app` | Unauthenticated browser requests are redirected here |
| `OATHKEEPER_PUBLIC_URL` | `https://rexform-oathkeeper-production.up.railway.app` | The public URL Railway assigns to this service — injected into access-rules.yml at startup |
| `COUCHDB_ADMIN_URL` | `http://admin:NEW_PASSWORD@couch-db.railway.internal:5984` | Internal Railway URL with admin credentials — **never expose externally**. Injected into access-rules.yml at startup. |

> `OATHKEEPER_PUBLIC_URL` and `COUCHDB_ADMIN_URL` are substituted into access-rules.yml
> by `envsubst` when the container starts (see Dockerfile CMD). They are NOT written
> into any image layer.

---

## Railway service: rexform-notes (Next.js)

Add / update these on the **Next.js** Railway service.

| Variable | Value | Notes |
|---|---|---|
| `COUCHDB_PROXY_URL` | `https://rexform-oathkeeper-production.up.railway.app` | Replaces direct CouchDB calls in production |
| `COUCHDB_PASSWORD` | `NEW_PASSWORD` | Rotated password — keep in sync with `COUCHDB_ADMIN_URL` above |

---

## Password rotation

Run this **once** to set the new CouchDB admin password (replace `NEW_PASSWORD`):

```bash
curl -X PUT https://couch-db-production.up.railway.app/_node/nonode@nohost/_config/admins/admin \
  -u admin:obsidian123 \
  -d '"Rg7mKs3vPw9Nx4Lz"'
```

Expected response: `"obsidian123"` (the old password, echoed back by CouchDB).

The new password is: **`Rg7mKs3vPw9Nx4Lz`**

Update both:
- `COUCHDB_ADMIN_URL=http://admin:Rg7mKs3vPw9Nx4Lz@couch-db.railway.internal:5984`
- `COUCHDB_PASSWORD=Rg7mKs3vPw9Nx4Lz` (on the Next.js service)

---

## Health check

Configure Railway to probe the Oathkeeper service at:
- **Port**: `4456` (Oathkeeper API port)
- **Path**: `/health/alive`

This avoids needing an access rule for health checks on the proxy port (4455).

---

## Ports

| Port | Purpose |
|---|---|
| `4455` | Public proxy — all CouchDB traffic goes here |
| `4456` | Admin / health API — internal only, never expose publicly |
