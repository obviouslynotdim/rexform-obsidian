# System Overview

## What Is REXFORM Notes

REXFORM Notes is a self-hosted, multi-user note-taking platform built on Obsidian's sync protocol. Each registered user gets an isolated CouchDB database (vault). Notes are written in Markdown and edited in a full Obsidian-style web workspace: file-tree sidebar with drag-and-drop, tabs, three editor modes (Reading / Live Preview / Source), wikilinks with backlinks and a D3 knowledge graph, and a community-plugin system (Kanban boards, calendar, GitLab, LiveSync).

Users can connect the Obsidian desktop or mobile app directly to their vault via the [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) plugin, enabling offline-capable, bidirectional sync without using Obsidian Sync.

**Core capabilities:**

- **Private vaults** — one isolated CouchDB database per user, provisioned automatically on registration
- **Shared vaults** — collaborative workspaces with owner / editor / viewer roles enforced by Ory Keto; this is shared read/write access with LiveSync-style eventual consistency, not real-time co-editing
- **Authentication** — Kratos email/password sessions plus an optional central-IAM SSO login (email-linked to an existing local identity, or tracked as an SSO-only account if none exists)
- **Web workspace** — sidebar file tree (folders, drag-and-drop, context menus), tabs per vault, resizable panels, Ctrl+K quick switcher with full-text search, and a separate full-page `/search` route
- **Editor** — Reading, Live Preview (CodeMirror 6 inline WYSIWYG), and Source modes; YAML frontmatter round-trip with a collapsible Properties panel; collapsible headings; Mermaid diagrams
- **Wikilinks & graph** — `[[wikilinks]]` with autocomplete, backlinks panel, vault-wide and folder-scoped D3 graph with a collapsible Analytics sidebar (note/link/orphan counts, most-connected list) and a resizable note-preview panel
- **Plugins** — Obsidian-style community plugin browser with per-plugin settings pages; native plugins: Kanban (markdown-backed boards, Obsidian Kanban-plugin compatible), Calendar, GitLab Work Items, Self-hosted LiveSync, PDF Export (renders Reading view through the browser's print dialog), Speech (Web Speech API read-aloud + dictation)
- **LiveSync integration** — per-user CouchDB credentials for direct Obsidian app sync
- **Profile & settings** — per-user profile (name, username, password change with current-password re-verification; SSO-only accounts get a read-only name and no password section), settings modal (editor, sync, plugins, language — English/Khmer, scoped to the settings UI)
- **Admin panel** — a single searchable/paginated table unifying local-Kratos and SSO-only user identities with stats, suspend/reactivate, per-user vault management, and a separate shared-vaults admin table
- **Obsidian-remote** — browser-based Obsidian desktop (KasmVNC) for admin vault browsing

See [Web App](web-app.md) for the frontend feature reference.

---

## Service Map

| Service | Technology | Role |
|---|---|---|
| `rexform-notes` | Next.js 14 | Web app, all API routes |
| `rexform-kratos` | Ory Kratos v1.2.0 | Identity: registration, login, sessions |
| `kratos-postgres` | PostgreSQL | Kratos data store |
| `couch-db` | Apache CouchDB 3 | Notes storage, LiveSync sync target |
| `oathkeeper` | Ory Oathkeeper | CouchDB read proxy for admin vault |
| `rexform-keto` | Ory Keto v0.11.1 | Shared vault permission tuples |
| `Postgres` | PostgreSQL | Keto data store |
| `obsidian-remote` | linuxserver/obsidian | Browser-based Obsidian desktop |

All services run on [Railway](https://railway.app) in the `production` environment (`d3975300-8402-4f76-906a-7469b3cde4c2`).

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.35 |
| UI | React | 18 |
| Session management | NextAuth.js | 4.24.14 |
| Language | TypeScript | 5 |
| Styling | Tailwind CSS | 3.4.1 |
| Data fetching (client) | SWR | 2.2.5 |
| Markdown rendering (Reading view) | react-markdown + remark-gfm | 9.0.1 / 4.0.0 |
| Editor (Live Preview / Source) | CodeMirror 6 (@codemirror/*) | 6.x |
| Knowledge graph | d3 | 7.9.0 |
| Diagrams | mermaid | 11.16.0 |
| Kanban drag-and-drop | @hello-pangea/dnd | 18.0.1 |
| Identity SDK | @ory/kratos-client | 26.2.0 |
| Permission SDK | @ory/keto-client | 26.2.0 |

---

## High-Level Architecture

```
Browser / Obsidian App
        │
        ├── rexform-notes (Next.js 14)        main app + all API routes
        │       │
        │       ├── rexform-kratos            identity, login, sessions
        │       │       └── kratos-postgres
        │       │
        │       ├── oathkeeper                CouchDB read proxy (admin vault)
        │       │
        │       ├── rexform-keto              shared vault permissions
        │       │       └── Postgres
        │       │
        │       └── couch-db                  notes storage + LiveSync target
        │
        └── obsidian-remote                   browser Obsidian (admin use)
```

See [Architecture](architecture.md) for detailed sequence diagrams and data flows.
