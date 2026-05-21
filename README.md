# Obsidian Remote on Railway

Self-hosted Obsidian in the browser via Railway, with CouchDB LiveSync support.

## What this fixes
- Community plugins failing to download (`ERR_NAME_NOT_RESOLVED`)
- DNS resolution broken inside Electron on Railway's IPv6 internal resolver
- Vault data lost on redeploy

## How it works
The `Dockerfile` extends the official `linuxserver/obsidian` image and injects a DNS fix script at `/etc/cont-init.d/01-dns.sh` which runs before Obsidian starts, overwriting the broken IPv6 DNS with Google and Cloudflare DNS.

## Railway setup

### Environment variables
Set these in Railway → your service → Variables:

| Variable | Value |
|----------|-------|
| `PUID` | `1000` |
| `PGID` | `1000` |
| `TZ` | your timezone e.g. `Asia/Phnom_Penh` |
| `UNSAFE_SSL` | `true` |
| `ELECTRON_EXTRA_LAUNCH_ARGS` | `--no-sandbox` |

### Volume
Mount a persistent volume at `/config` to keep your vault and plugins across redeploys.

### LiveSync / CouchDB
Set your CouchDB connection details inside Obsidian → Settings → LiveSync after the container is running.

## Deploying

1. Fork or clone this repo
2. In Railway → New Project → Deploy from GitHub repo
3. Select this repo
4. Add the environment variables above
5. Add a volume at `/config`
6. Deploy

## Updating
Railway will auto-redeploy when you push to main. Your vault is safe on the `/config` volume.
