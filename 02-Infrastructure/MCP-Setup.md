---
tags:
  - setup
  - mcp
  - claude
date: '2026-05-26'
---
# MCP Setup

**Date:** 2026-05-26

## What We Did

Set up and tested the **Obsidian MCP (Model Context Protocol)** server integration with Claude Code, enabling Claude to read and write notes directly inside this vault.

## Steps Completed

1. **Connected the Obsidian MCP server** to Claude Code — the `mcp__obsidian__*` tools became available in the session.
2. **Explored the vault** using MCP tools:
   - `get_vault_stats` — confirmed 5 notes, 2 folders, ~9 KB total size
   - `list_directory` — browsed root, `Rexform Group/`, and `git-obsidian/` folders
3. **Created this note** using `write_note` — confirming that Claude can create and write notes into the vault directly.

## Vault Structure (as of today)

```
my-vaults/
├── Welcome.md
├── Self-hosted LiveSync.md
├── MCP Setup.md          ← this note
├── Rexform Group/
│   ├── Welcome aboard with us!.md
│   └── livesync-setup.md
└── git-obsidian/
    └── git-file-sync.md.md
```

## Notes

- MCP tools allow Claude Code to interact with Obsidian without leaving the terminal.
- Works alongside the existing LiveSync and git-based sync setups already in this vault.
