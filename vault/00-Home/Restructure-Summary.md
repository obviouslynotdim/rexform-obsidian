---
tags:
  - summary
  - home
  - restructure
date: '2026-05-27'
---
# Vault Restructure Summary

**Date:** 2026-05-27

---

## Structure
Replaced vague folder names with a clean numbered system:

| Old | New |
|-----|-----|
| `copilot/copilot-custom-prompts/` | `03-AI-Prompts/` |
| `git-obsidian/` | `02-Infrastructure/` |
| `Rexform Group/` | `01-Rexform/` |
| *(none)* | `00-Home/` |
| *(none)* | `04-Docs/` |

---

## Moves
- 15 AI prompts relocated to `03-AI-Prompts/`
- 4 setup notes moved to `02-Infrastructure/`
- Fixed double `.md.md` extension bug on Git Sync note

---

## Deleted
- `Self-hosted LiveSync.md` — junk/test content
- `Welcome.md` — default Obsidian placeholder
- 3 empty legacy folders

---

## Security
- Real GitLab & GitHub tokens scrubbed from `Credentials-Reference.md`
- Replaced with password manager placeholders
- Tokens revoked by owner on 2026-05-27

---

## Config
- `node_modules/` and `.vitepress/cache` excluded from Obsidian indexing via `.obsidian/app.json`

---

## New Notes Added
- `00-Home/Dashboard.md` — vault index & quick links
- `01-Rexform/Onboarding.md` — team welcome & setup checklist
- `00-Home/Vault-Changelog.md` — detailed change log
- `00-Home/Restructure-Summary.md` — this file

---

## Pending
- [ ] Generate new GitLab & GitHub PATs → update Git File Sync plugin
- [x] Verify LiveSync (CouchDB on Railway) is still connected — ✅ Online, 33,815 docs synced
- [ ] Update Copilot plugin prompts folder path to `03-AI-Prompts/`
