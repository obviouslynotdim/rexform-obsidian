---
tags:
  - home
  - dashboard
date: '2026-05-27'
---
# 🏠 Vault Dashboard

> **Rexform Group** — Central knowledge base & infrastructure documentation

---

## 📁 Vault Structure

| Folder | Purpose |
|--------|---------|
| `01-Rexform/` | Team onboarding & credentials reference |
| `02-Infrastructure/` | Setup guides: LiveSync, MCP, Git Sync |
| `03-AI-Prompts/` | Copilot custom AI prompt library |
| `04-Docs/` | Reference docs & syntax examples |

---

## 🔗 Quick Links

- [[Credentials-Reference]] — Where tokens live (password manager)
- [[MCP-Setup]] — Claude Code ↔ Obsidian integration
- [[LiveSync-Setup]] — CouchDB real-time device sync
- [[Git-Sync-Setup]] — GitLab / GitHub file backup

---

## ⚙️ Site & Sync

| Layer | Tool | Location |
|-------|------|----------|
| Docs site | VitePress | `index.md`, `.vitepress/` at root |
| Real-time sync | Self-hosted LiveSync | CouchDB on Railway |
| Version backup | Git File Sync | GitLab / GitHub |
| AI integration | Obsidian MCP | Claude Code ↔ vault |

---

> 🔒 Secrets live in your **password manager only** — never in vault notes.
