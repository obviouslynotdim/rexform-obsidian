# Environment Variables

## rexform-notes

| Variable | Required | Description | Example |
|---|---|---|---|
| `NEXTAUTH_URL` | ✓ | Full public URL of the Next.js app | `https://rexform-notes-production.up.railway.app` |
| `NEXTAUTH_SECRET` | ✓ | JWT signing and encryption secret (min 32 chars) | `openssl rand -base64 32` |
| `NEXT_PUBLIC_KRATOS_PUBLIC_URL` | ✓ | Kratos public API URL — accessible from the browser | `https://rexform-kratos-production.up.railway.app` |
| `KRATOS_ADMIN_URL` | ✓ | Kratos admin API URL — server-side only | `http://kratos.railway.internal:4434` |
| `COUCHDB_URL` | ✓ | CouchDB **public** URL — used for admin operations (internal URL drops auth headers) | `https://couch-db-production.up.railway.app` |
| `COUCHDB_USERNAME` | ✓ | CouchDB admin username | `admin` |
| `COUCHDB_PASSWORD` | ✓ | CouchDB admin password | `<secret>` |
| `COUCHDB_DATABASE` | Optional | Default database name | `obsidian` |
| `COUCHDB_PROXY_URL` | Optional | Oathkeeper proxy URL for reads on admin vault. Unset = direct admin auth (local dev only) | `https://oathkeeper-production-316a.up.railway.app` |
| `COUCHDB_ADMIN_USER` | Optional | Falls back to `COUCHDB_USERNAME` | `admin` |
| `COUCHDB_ADMIN_PASSWORD` | Optional | Falls back to `COUCHDB_PASSWORD` | `<secret>` |
| `ADMIN_USER_ID` | ✓ | Kratos identity UUID of the admin account | `957e5bcc-eb3f-442d-b5ec-0f47cac3282c` |
| `KETO_READ_URL` | Optional | Keto Read API. Unset = shared vault permissions disabled | `http://rexform-keto.railway.internal:4466` |
| `KETO_WRITE_URL` | Optional | Keto Write API | `http://rexform-keto.railway.internal:4467` |
| `SSO_ISSUER_URL` | Optional | Central IAM OIDC issuer (rexform-ory-dev gateway). No trailing slash. Set all four SSO vars together or none | `https://gateway-production-1b0d.up.railway.app` |
| `SSO_CLIENT_ID` | Optional | OAuth2 client ID registered in the central Hydra | `<from IAM client registration>` |
| `SSO_CLIENT_SECRET` | Optional | OAuth2 client secret | `<secret>` |
| `NEXT_PUBLIC_SSO_ENABLED` | Optional | Shows the "Continue with REXFORM SSO" button on login/register | `true` |

---

## rexform-kratos

| Variable | Required | Description |
|---|---|---|
| `DSN` | ✓ | PostgreSQL connection string — points to `kratos-postgres` |
| `SECRETS_DEFAULT` | ✓ | Kratos data encryption secret (min 16 chars) |
| `SECRETS_COOKIE` | ✓ | Browser cookie encryption secret |

---

## rexform-keto

| Variable | Required | Description |
|---|---|---|
| `DSN` | ✓ | Set as `${{Postgres.DATABASE_URL}}` (Railway cross-service variable) |
| `KETO_DATABASE_URL` | ✓ | Same value as `DSN` — referenced in `keto.yml` |

**Note:** When setting `DSN` in Railway, use `${{Postgres.DATABASE_URL}}` as a Railway variable reference. Using a compound string like `postgres://${{Postgres.POSTGRES_USER}}:...` fails to resolve.

---

## oathkeeper

| Variable | Required | Description |
|---|---|---|
| `COUCHDB_ADMIN_URL` | ✓ | `http://admin:<password>@couch-db.railway.internal:5984` — credentials embedded in URL |
| `KRATOS_PUBLIC_URL` | ✓ | Kratos public URL — used for session validation (`/sessions/whoami`) |

---

## couch-db

| Variable | Required | Description |
|---|---|---|
| `COUCHDB_USER` | ✓ | Admin username |
| `COUCHDB_PASSWORD` | ✓ | Admin password |

---

## obsidian-remote

| Variable | Required | Description |
|---|---|---|
| `PUID` | ✓ | User ID for container process (typically `1000`) |
| `PGID` | ✓ | Group ID for container process (typically `1000`) |
| `CUSTOM_USER` | ✓ | KasmVNC login username |
| `PASSWORD` | ✓ | KasmVNC login password |
| `TZ` | Optional | Timezone — e.g. `Asia/Phnom_Penh` |

---

## Finding the Admin User ID

After the first admin login, retrieve the identity UUID from Kratos:

```bash
curl -s https://rexform-kratos-production.up.railway.app/admin/identities \
  | jq '.[] | select(.traits.email == "admin@example.com") | .id'
```

Set the output as `ADMIN_USER_ID` on `rexform-notes`.
