# Setting Up Obsidian on Railway

> Self-hosted Obsidian using `lscr.io/linuxserver/obsidian:latest` on Railway with CouchDB LiveSync

> **Scope note:** this walks through the standalone `obsidian-remote` + `couch-db` pair in isolation — useful for testing the raw LinuxServer/Obsidian image against CouchDB LiveSync. In the full REXFORM platform, `obsidian-remote` is one of 8 Railway services (see [Services](services.md#obsidian-remote) / [Deployment Guide](deployment.md)): a KasmVNC-based, admin-only vault-inspection tool, not required for the core app. Regular users don't connect to the shared `admin` / `obsidian123` database below — they sync with per-user CouchDB credentials provisioned automatically per vault (see [Vault Management](vaults.md#per-user-couchdb-credential-provisioning)).

---

## Services overview

| Service | Image | Purpose |
|---------|-------|---------|
| `obsidian-remote` | `lscr.io/linuxserver/obsidian:latest` | Obsidian desktop in browser |
| `couch-db` | `couchdb:3` | Sync server for LiveSync plugin |

---

## obsidian-remote

### Image
```
lscr.io/linuxserver/obsidian:latest
```

### Volume
| Mount path | Purpose |
|------------|---------|
| `/config` | Vault, plugins, settings — must be persistent |

### Ports
| Port | Use |
|------|-----|
| `3000` | HTTP |
| `3001` | HTTPS (recommended) — served via KasmVNC, the in-browser remote-desktop layer that renders the actual Obsidian desktop app |

### Environment variables
```
PUID=1000
PGID=1000
TZ=Asia/Phnom_Penh
CUSTOM_USER=yourusername
PASSWORD=yourpassword
```

### Networking
- Set Railway domain to port **3001**
- Access via `https://obsidian-remote-xxxx.up.railway.app`
- Browser will warn about self-signed cert — click **Advanced → Proceed**

---

## couch-db

### Image
```
couchdb:3
```

### Volume
| Mount path | Purpose |
|------------|---------|
| `/opt/couchdb/data` | Database files — must be persistent |

### Port
| Port | Use |
|------|-----|
| `5984` | CouchDB HTTP API |

### Environment variables
```
COUCHDB_USER=admin
COUCHDB_PASSWORD=obsidian123
```

### Initialize (run once after first deploy)

SSH into couch-db or run from any terminal:

```bash
curl -X POST https://couch-db-xxxx.up.railway.app/_cluster_setup \
  -u admin:obsidian123 \
  -H "Content-Type: application/json" \
  -d '{"action":"enable_single_node","bind_address":"0.0.0.0","port":5984}'
```

---

## Self-hosted LiveSync plugin setup

After Obsidian is running and CouchDB is initialized:

1. Open Obsidian → **Settings → Community plugins**
2. Disable restricted mode
3. Search and install **Self-hosted LiveSync**
4. Go to plugin settings and configure:

| Field | Value |
|-------|-------|
| Remote database URI | `https://couch-db-xxxx.up.railway.app` |
| Username | `admin` |
| Password | `obsidian123` |
| Database name | `obsidian` |
| End-to-end encryption | optional but recommended |

5. Click **Test and Save** → **Replicate now**

Repeat on every device (phone, laptop, desktop) to keep all vaults in sync.

> The credentials above (`admin` / `obsidian123`, database `obsidian`) are for this standalone test setup only. In production, each user gets their own database and non-admin CouchDB user (`vault-<userId>` and matching credentials), issued from Settings → Sync in the web app — see [Vault Management](vaults.md).

---

## Architecture

```
Browser / Devices
       │
       ├── obsidian-remote (Railway)
       │     └── /config volume  ←  vault + plugins
       │
       └── couch-db (Railway)
             └── /opt/couchdb/data volume  ←  sync database
                    ↕
             Native Obsidian apps
             (phone, laptop, desktop via LiveSync)
```

---

## Important notes

- Volume mount at `/config` is **required** — without it vault is wiped on every redeploy
- HTTPS is **required** since July 2025 for full browser functionality
- obsidian-remote is **single user** — one browser session at a time
- couch-db syncs **all devices** — install LiveSync on each native Obsidian app
- Do not expose either service without authentication

---

## References

- LinuxServer Obsidian docs: https://docs.linuxserver.io/images/docker-obsidian
- Self-hosted LiveSync: https://github.com/vrtmrz/obsidian-livesync
- Railway: https://railway.app
