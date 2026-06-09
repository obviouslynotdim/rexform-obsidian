# REXFORM Notes

A self-hosted note-taking platform built on Next.js and CouchDB, with Obsidian LiveSync for offline editing.

## Structure

```
rexform-obsidian/
├── app/          # Next.js web app (notes UI, API routes)
├── infra/        # Dockerfile for Obsidian Remote (browser-based Obsidian)
├── docs/         # VitePress documentation site
└── vault/        # Personal Obsidian vault (content gitignored)
```

## Services

| Service | Description |
|---------|-------------|
| `app/` | Next.js frontend deployed on Railway |
| CouchDB | Note storage on Railway (one database per user) |
| Obsidian LiveSync | Syncs the local vault to CouchDB |

## Local Development

```bash
cd app
npm install
npm run dev
```

Set the following in `app/.env.local`:

```
COUCHDB_URL=https://your-couchdb.up.railway.app
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=your-password
COUCHDB_DATABASE=obsidian
```

## Deployment

Each folder deploys independently on Railway:

- **`app/`** — Next.js app, uses `app/Dockerfile` and `app/railway.toml`
- **`infra/`** — Obsidian Remote, uses `infra/Dockerfile` and `infra/railway.toml`
- **`docs/`** — VitePress docs, uses `docs/Dockerfile`

## Vault

The `vault/` folder is a local Obsidian vault synced to CouchDB via the Self-hosted LiveSync plugin. Vault content (`.md` files) is gitignored — only configuration files are tracked.
