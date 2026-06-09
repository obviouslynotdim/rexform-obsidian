# Security

## Encryption Layers

| Layer | Mechanism | Details |
|---|---|---|
| NextAuth JWT cookie | AES-256-GCM via `NEXTAUTH_SECRET` | Session cookie is encrypted on the client; server decrypts on every request |
| Kratos passwords | bcrypt (managed by Kratos) | Passwords never stored in plaintext; bcrypt with default cost factor |
| CouchDB transport | HTTPS (Railway TLS termination) | All browser traffic to `couch-db-production.up.railway.app` is TLS |
| Oathkeeper transport | HTTPS (Railway TLS termination) | Traffic to Oathkeeper public endpoint is TLS |
| Kratos transport | HTTPS (Railway TLS termination) | Traffic to Kratos public endpoint is TLS |
| Kratos cookie data | `SECRETS_COOKIE` env var | Browser-flow session cookies encrypted |
| Kratos internal data | `SECRETS_DEFAULT` env var | Sensitive Kratos data encryption |

---

## What Is Not Encrypted (and Why)

| Item | Status | Reason |
|---|---|---|
| Note content in CouchDB | Plaintext at rest | CouchDB has no transparent field-level encryption. Enabling Obsidian LiveSync's E2E encryption would break the web editor and server-side search. |
| Railway internal traffic | HTTP (not HTTPS) | Inter-service traffic on `*.railway.internal` is HTTP. Railway's internal network is isolated and not internet-accessible. |
| `livesync_password` in `_users` | Plaintext custom field | CouchDB auto-hashes the `password` field (bcrypt). We store a copy in `livesync_password` so `getUserCredentials()` can retrieve it for display in Settings. |
| Admin credentials | Plaintext Railway env vars | `COUCHDB_ADMIN_PASSWORD` lives in Railway's config store. Not encrypted at rest by Railway. |

---

## Per-User CouchDB Credential Scoping

LiveSync credentials are scoped to the user's own vault only:

1. `PUT /_users/org.couchdb.user:<userId>` — CouchDB user record created
2. The user's password authenticates them as `userId` in CouchDB
3. `vault-<userId>/_security.members.names` contains `[userId]`
4. CouchDB enforces that this user can only access databases where they appear in `_security`
5. The user cannot reach other users' vaults, the `obsidian` vault, or `_users`

---

## CouchDB Admin Password Rotation

If the admin password needs to be changed:

```bash
curl -X PUT https://couch-db-production.up.railway.app/_node/nonode@nohost/_config/admins/admin \
  -u admin:OLD_PASSWORD \
  -H "Content-Type: application/json" \
  -d '"NEW_PASSWORD"'
```

After rotation, update these Railway environment variables:
- `COUCHDB_PASSWORD` on `rexform-notes`
- `COUCHDB_ADMIN_PASSWORD` on `rexform-notes`
- `COUCHDB_ADMIN_URL` on `oathkeeper` (contains inline credentials)

---

## LiveSync End-to-End Encryption

Not currently configured. The Obsidian Self-hosted LiveSync plugin supports E2E encryption where note content is encrypted in the browser before being sent to CouchDB. Enabling this:

- **Prevents** the server operator from reading note contents
- **Breaks** the web editor (cannot decrypt without the user's passphrase)
- **Breaks** server-side search
- **Breaks** starter note seeding (notes would be created encrypted with the wrong key)

Recommended only for deployments where note confidentiality from the server operator is a strict requirement.

---

## Production Security Checklist

- [ ] Rotate all default secrets — `NEXTAUTH_SECRET`, `COUCHDB_ADMIN_PASSWORD`, `SECRETS_DEFAULT`, `SECRETS_COOKIE` — must be unique, randomly generated values
- [ ] Configure a real SMTP provider in `kratos.yml` and enforce email verification before vault access
- [ ] Add rate limiting on `/api/auth/*` and note write routes
- [ ] Verify Keto admin port (4467) and Kratos admin port (4434) are not publicly accessible
- [ ] Decide whether `livesync_password` stored in plaintext is acceptable for your threat model
- [ ] Consider enabling LiveSync E2E encryption if note confidentiality from the server is required
