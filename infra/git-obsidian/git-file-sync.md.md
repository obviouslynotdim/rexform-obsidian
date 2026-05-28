# Git File Sync — Obsidian Setup

> Selective note backup and sync with GitLab/GitHub, file by file.

---

## What it does

Syncs individual notes from your Obsidian vault to a GitLab or GitHub repo. Unlike LiveSync which syncs between devices in real-time, Git File Sync gives you version history and selective control over what gets backed up.

| | LiveSync | Git File Sync |
|---|---|---|
| Purpose | Real-time device sync | Versioned backup |
| Storage | CouchDB (Railway) | GitLab / GitHub |
| Granularity | Whole vault | File by file |
| Use together | ✅ Yes | ✅ Yes |

---

## Installation

Since community plugin browser may fail in obsidian-remote, install manually via SSH:

```bash
mkdir -p /config/my-vaults/.obsidian/plugins/git-file-sync
cd /config/my-vaults/.obsidian/plugins/git-file-sync

curl -L -o main.js https://github.com/firstsun-dev/git-files-sync/releases/latest/download/main.js && \
curl -L -o manifest.json https://github.com/firstsun-dev/git-files-sync/releases/latest/download/manifest.json && \
curl -L -o styles.css https://github.com/firstsun-dev/git-files-sync/releases/latest/download/styles.css
```

Reload Obsidian → Settings → Community plugins → enable **Git File Sync**.

---

## GitLab setup

**1. Create a repo** — gitlab.com → New project → blank → Private → no README

**2. Get your Project ID** — shown on the project main page under the name

**3. Create a token** — Settings → Access → Personal access tokens → Generate token → **Legacy** → check **`api`** scope → Generate

**4. Fix branch protection** — Settings → Repository → Protected branches → `main` → set Allowed to push to **Maintainers**

---

## GitHub setup

**1. Create a repo** — github.com → New → Private → no README

**2. Create a token** — Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate → check **`repo`** scope → Generate

---

## Plugin configuration

Settings → **Git File Sync**:

### GitLab
| Field | Value |
|-------|-------|
| Service | `GitLab` |
| Personal Access Token | your token |
| Project ID | your project ID |
| Base URL | `https://gitlab.com` |
| Branch | `main` |
| Root Path | leave empty |
| Vault Folder | leave empty |

### GitHub
| Field | Value |
|-------|-------|
| Service | `GitHub` |
| Personal Access Token | your token |
| Owner | your GitHub username |
| Repo Name | `obsidian-vault` |
| Branch | `main` |
| Root Path | leave empty |
| Vault Folder | leave empty |

---

## Daily workflow

**Push a note** — right-click any note → Push to GitLab/GitHub

**Push multiple** — list icon in ribbon → Refresh status → select files → ↑ Push selected

**Pull from repo** — list icon → Refresh status → ↓ Pull selected

**Conflict** — plugin opens side-by-side diff → Keep Local or Keep Remote

---

## References

- Plugin repo: https://github.com/firstsun-dev/git-files-sync
- Community page: https://community.obsidian.md/plugins/git-file-sync
