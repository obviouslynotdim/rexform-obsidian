---
tags:
  - changelog
  - home
date: '2026-05-27'
---
# Vault Changelog

## 2026-05-27 — Vault Restructure & Security Cleanup

### 🗂️ Folder Restructure
- Renamed `Rexform Group/` → `01-Rexform/`
- Renamed `copilot/copilot-custom-prompts/` → `03-AI-Prompts/`
- Renamed `git-obsidian/` → merged into `02-Infrastructure/`
- Created `00-Home/`, `02-Infrastructure/`, `04-Docs/` (new folders)
- Removed 3 empty legacy folders after migration

### 📄 Notes Moved & Renamed
| Old Path | New Path |
|----------|----------|
| `Rexform Group/Welcome onboard with us!.md` | `01-Rexform/Credentials-Reference.md` |
| `Rexform Group/MCP Setup.md` | `02-Infrastructure/MCP-Setup.md` |
| `Rexform Group/livesync-setup.md` | `02-Infrastructure/LiveSync-Setup.md` |
| `git-obsidian/git-file-sync.md.md` | `02-Infrastructure/Git-Sync-Setup.md` |
| `VitePress Theme.md` | `04-Docs/VitePress-Theme-Examples.md` |
| `copilot/copilot-custom-prompts/*.md` (×15) | `03-AI-Prompts/*.md` |

### ✨ New Notes Created
- `00-Home/Dashboard.md` — vault index & quick links
- `01-Rexform/Onboarding.md` — team welcome & setup checklist
- `00-Home/Vault-Changelog.md` — this file

### 🗑️ Deleted
- `Self-hosted LiveSync.md` — test/junk content
- `Welcome.md` — default Obsidian placeholder

### 🔒 Security
- Removed real GitLab & GitHub tokens from `Credentials-Reference.md`
- Replaced with password manager placeholders
- Tokens were revoked by owner on 2026-05-27

### ⚙️ Config
- `node_modules/` and `.vitepress/cache` excluded from Obsidian indexing via `.obsidian/app.json`
- Fixed double extension bug: `git-file-sync.md.md` → `Git-Sync-Setup.md`

---

### 🔴 Pending
- [ ] Generate new GitLab & GitHub PATs → update Git File Sync plugin
- [ ] Verify LiveSync (CouchDB on Railway) is still connected
- [ ] Update Copilot plugin prompts folder path to `03-AI-Prompts/`
