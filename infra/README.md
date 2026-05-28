# Obsidian on Railway

Self-hosted Obsidian in the browser via Railway, with CouchDB LiveSync sync support.

---

## Services

| Service | Image | Purpose |
|---------|-------|---------|
| `obsidian-remote` | `lscr.io/linuxserver/obsidian:latest` | Obsidian desktop in browser |
| `couch-db` | `couchdb:3` | Sync server for Self-hosted LiveSync plugin |

---

## What this fixes

- Community plugins failing to load in browser (`Failed to load community plugins`)
- Vault data lost on redeploy — fixed by mounting volume at `/config`
- Black screen / segfault — caused by outdated `sytone/obsidian-remote` image (abandoned 2022), replaced with actively maintained `linuxserver/obsidian`

---

## How it works

The `Dockerfile` extends `lscr.io/linuxserver/obsidian:latest` which:

- Automatically downloads the latest Obsidian release at build time
- Extracts the AppImage to `/opt/obsidian` — no FUSE required
- Uses KasmVNC / Selkies with Wayland for modern, stable browser display
- Stores all vault data, plugins, and settings under `/config`

---

## Railway setup

### obsidian-remote — environment variables

Set in Railway → obsidian-remote → Variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `PUID` | `1000` | User ID for file permissions |
| `PGID` | `1000` | Group ID for file permissions |
| `TZ` | `Asia/Phnom_Penh` | Your timezone |
| `CUSTOM_USER` | your username | HTTP Basic auth username |
| `PASSWORD` | your password | HTTP Basic auth password |

### obsidian-remote — volume

Mount a persistent volume at `/config` to keep your vault, plugins, and settings across every redeploy.

### obsidian-remote — networking

Set your Railway domain to port **3001** (HTTPS). On first visit the browser will warn about a self-signed certificate — click **Advanced → Proceed**.

---

### couch-db — environment variables

| Variable | Value |
|----------|-------|
| `COUCHDB_USER` | `admin` |
| `COUCHDB_PASSWORD` | your password |

### couch-db — initialize (run once)

After the first deploy, SSH into the couch-db service and run:

```bash
curl -X POST http://localhost:5984/_cluster_setup \
  -u admin:yourpassword \
  -H "Content-Type: application/json" \
  -d '{"action":"enable_single_node","bind_address":"0.0.0.0","port":5984}'
```

---

## Self-hosted LiveSync plugin

Once Obsidian is running, install and configure the LiveSync plugin:

1. Settings → Community plugins → install **Self-hosted LiveSync**
2. Configure with your CouchDB Railway URL:

| Field | Value |
|-------|-------|
| Remote database URI | `https://couch-db-xxxx.up.railway.app` |
| Username | `admin` |
| Password | your CouchDB password |
| Database name | `obsidian` |

3. Click **Test and Save** → **Replicate now**

Install on every device to keep all vaults in sync.

---

## Deploying

1. Fork or clone this repo
2. Railway → New Project → Deploy from GitHub repo
3. Select this repo — Railway will use the `Dockerfile` automatically
4. Add environment variables listed above
5. Add a persistent volume mounted at `/config`
6. Set networking domain to port `3001`
7. Deploy

---

## Updating

Railway redeploys automatically when you push to `main`. Your vault is safe on the `/config` volume. To update Obsidian itself, rebuild the image — it pulls the latest release at build time.

---

## References

- LinuxServer Obsidian docs: https://docs.linuxserver.io/images/docker-obsidian
- Self-hosted LiveSync: https://github.com/vrtmrz/obsidian-livesync
- Railway config as code: https://docs.railway.app/reference/config-as-code
