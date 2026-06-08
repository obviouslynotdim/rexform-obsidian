# Deployment Guide

## Service Deployment Order

Services must be deployed in dependency order:

```
1. kratos-postgres    no dependencies
2. Postgres (keto)    no dependencies
3. couch-db           no dependencies
4. rexform-kratos     needs kratos-postgres (DSN)
5. rexform-keto       needs Postgres (DSN), runs migrate up on start
6. oathkeeper         needs couch-db (upstream) + rexform-kratos (session check)
7. rexform-notes      needs all of the above
8. obsidian-remote    independent, deploy any time
```

---

## Step-by-Step

### 1. Postgres services (`kratos-postgres`, `Postgres`)

Use Railway's managed PostgreSQL. Both auto-expose `DATABASE_URL`. No additional configuration needed.

---

### 2. `couch-db`

- Image: `couchdb:3`
- Add persistent volume at `/opt/couchdb/data`
- Set `COUCHDB_USER` and `COUCHDB_PASSWORD`
- After first deploy, initialize the single-node cluster:

```bash
curl -X POST https://couch-db-production.up.railway.app/_cluster_setup \
  -u admin:PASSWORD \
  -H "Content-Type: application/json" \
  -d '{"action":"enable_single_node","bind_address":"0.0.0.0","port":5984}'
```

Verify:
```bash
curl https://couch-db-production.up.railway.app/_up
# → {}
```

---

### 3. `rexform-kratos`

- Uses Dockerfile in `kratos/`
- Set `DSN`, `SECRETS_DEFAULT`, `SECRETS_COOKIE`
- The after-registration webhook URL in `kratos/kratos.yml` must point to the live `rexform-notes` domain — update it before deploying if the domain changed

Verify:
```bash
curl https://rexform-kratos-production.up.railway.app/health/ready
# → { "status": "ok" }
```

---

### 4. `rexform-keto`

- Uses Dockerfile in `keto/`
- Set `DSN = ${{Postgres.DATABASE_URL}}` and `KETO_DATABASE_URL = ${{Postgres.DATABASE_URL}}`
- Migration runs automatically on container start via `echo y | keto migrate up`

Verify:
```bash
curl https://keto-production.up.railway.app/health/ready
```

---

### 5. `oathkeeper`

- Uses Dockerfile in `oathkeeper/`
- Set `COUCHDB_ADMIN_URL = http://admin:PASSWORD@couch-db.railway.internal:5984`
- Set `KRATOS_PUBLIC_URL = https://rexform-kratos-production.up.railway.app`

Verify:
```bash
curl https://oathkeeper-production-316a.up.railway.app/_up
# → {}
```

---

### 6. `rexform-notes`

- Auto-deploys from GitHub `main` branch
- Manual deploy: `railway up --service ddde10ba-fef1-4318-90ee-d79485f3ff0e --detach`
- Set all environment variables from [Environment Variables](environment.md)
- Set `ADMIN_USER_ID` after the first admin registration (see [Finding the Admin User ID](environment.md#finding-the-admin-user-id))

---

### 7. `obsidian-remote`

- Image: `lscr.io/linuxserver/obsidian:latest`
- Add persistent volume at `/config`
- Set port to `3001`
- Set `PUID`, `PGID`, `CUSTOM_USER`, `PASSWORD`

---

## Health Checks

| Service | Endpoint | Expected response |
|---|---|---|
| couch-db | `GET /couch-db-production.up.railway.app/_up` | `{}` |
| rexform-kratos | `GET /rexform-kratos-production.up.railway.app/health/ready` | `{ "status": "ok" }` |
| oathkeeper | `GET /oathkeeper-production-316a.up.railway.app/_up` | `{}` |
| rexform-keto (read) | `GET http://rexform-keto.railway.internal:4466/health/ready` | `{ "status": "ok" }` |
| rexform-keto (write) | `GET http://rexform-keto.railway.internal:4467/health/ready` | `{ "status": "ok" }` |
| rexform-notes | `GET /rexform-notes-production.up.railway.app/api/auth/session` | `{}` (unauthenticated) |

---

## Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| CouchDB admin operations return 401 | Using `couch-db.railway.internal` for admin ops | Use `COUCHDB_URL` (public HTTPS domain) for all admin operations |
| Keto `migrate up` hangs on deploy | v0.11 prompts interactively | Dockerfile must use `echo y \| keto migrate up` |
| Keto `DSN` env var resolves to empty | Compound variable interpolation in Railway fails | Use `${{Postgres.DATABASE_URL}}` as a single standalone value |
| Oathkeeper returns 401 on reads | Kratos session token expired | Expected for stale sessions — writes already bypass Oathkeeper |
| After-register webhook fails (502) | `rexform-notes` not deployed yet when Kratos fires the hook | Deploy `rexform-notes` before registering the first user |
| `_users` database not found | CouchDB 3 does not auto-create it | `ensureUsersDb()` handles this automatically on first credential provision |
| Shared vault member list empty | `getVaultMembers()` using Write URL | Use Read URL (port 4466) for all `GET /relation-tuples` calls |
| New service can't reach another service | Railway internal DNS not resolving | Use `<service-name>.railway.internal` — Railway sets this up automatically; may take 1–2 minutes after first deploy |

---

## Redeploy from CLI

```bash
# Deploy rexform-notes
railway up --service ddde10ba-fef1-4318-90ee-d79485f3ff0e --detach

# Check deployment status
railway status --service ddde10ba-fef1-4318-90ee-d79485f3ff0e
```

GitHub pushes to `main` trigger auto-deploy on `rexform-notes` without needing the CLI.
