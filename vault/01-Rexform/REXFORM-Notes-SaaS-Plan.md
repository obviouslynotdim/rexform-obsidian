---
tags: [saas, rexform, planning, obsidian]
date: 2026-05-27
---

# REXFORM Notes — SaaS Plan

## What we're building

A SaaS product where anyone can sign up and get their own private note-taking vault — powered by our Obsidian/CouchDB infrastructure behind the scenes. Users never know or care that it runs on Obsidian. They just see the app.

---

## What each user experiences

1. **They visit the app** — `rexform-notes.up.railway.app` or our own domain. They see the login page with REXFORM branding.
2. **They register** — email + password. Ory Kratos handles this. A CouchDB database is automatically created for them (`vault-userid123`).
3. **They get their own vault** — a personal workspace that looks like Obsidian but is our app. They can:
   - Create, edit, delete notes
   - Organize into folders
   - Search across their notes
   - Use markdown formatting
4. **Everything syncs** — their notes live in CouchDB on Railway. If they open Obsidian on their phone with LiveSync pointed at their database, it syncs automatically.
5. **Admin manages users** — admin panel to see all users, their vaults, suspend accounts, create shared vaults.

---

## Architecture

```
User's browser
      ↓
Next.js app (Railway)     ← your custom UI
      ↓
Ory Kratos (Railway)      ← handles login/register/sessions
      ↓
Ory Oathkeeper (Railway)  ← checks "is this user allowed?"
      ↓
CouchDB (Railway)         ← vault-user001, vault-user002...
```

> [!note]
> Users never touch CouchDB directly. They never see Obsidian. Everything goes through the Next.js app.

---

## What each service does

| Service | Job |
|---------|-----|
| Next.js | The UI — what users see and interact with |
| Ory Kratos | Handles registration, login, logout, password reset, sessions |
| Ory Oathkeeper | Security layer — every request is verified before reaching CouchDB |
| CouchDB | Stores all note data — one database per user |
| PostgreSQL | Stores Kratos user accounts and sessions |

---

## What admin controls

- Create/suspend/delete user accounts
- Create shared vaults (e.g. a team workspace multiple users can access)
- Set roles — viewer (read-only) vs editor (read/write)
- See all databases and their sizes

---

## Build phases

| Phase | What gets built                                   | Time   |
| ----- | ------------------------------------------------- | ------ |
| 1     | Next.js UI — note list, editor, folders, search   | 2 days |
| 2     | Ory Kratos — login, register, sessions            | 1 day  |
| 3     | Oathkeeper — protect CouchDB, route by user       | 1 day  |
| 4     | Auto-create vault on register, per-user isolation | 1 day  |
| 5     | Shared vaults, roles, admin panel                 | 2 days |

> [!tip]
> Total: about 1 week to a working SaaS product.

---

## Raw Obsidian vs REXFORM SaaS

| | Raw Obsidian | REXFORM SaaS app |
|---|---|---|
| Who uses it | Team only | Anyone who signs up |
| UI | Obsidian's UI | Custom branded UI |
| Access control | Manual CouchDB users | Full IAM with Ory |
| User management | Manual | Self-service register/login |
| Shared vaults | Manual setup | Built-in with roles |
| Mobile | Obsidian mobile app | Web app (any browser) |

---

## Current infrastructure already in place

- ✅ obsidian-remote on Railway (`lscr.io/linuxserver/obsidian:latest`)
- ✅ CouchDB on Railway (`couchdb:3`) — `https://couch-db-production.up.railway.app`
- ✅ Self-hosted LiveSync — vault syncing between obsidian-remote and local Windows
- ✅ Git File Sync — GitLab + GitHub backup
- ✅ MCPVault — Claude Code connected to local vault
- ✅ Copilot plugin — Claude inside Obsidian
- ✅ VitePress — docs site in `docs/` folder

---

## Next step

Start with **Phase 1** — build the Next.js frontend connected to CouchDB. Get the UI working with vault data first, then layer auth on top in Phase 2.
