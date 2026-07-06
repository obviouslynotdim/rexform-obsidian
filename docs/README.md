# REXFORM Notes — Technical Documentation

Multi-user, Obsidian-compatible note-taking platform with per-user CouchDB vaults, shared vault collaboration, direct LiveSync support, and a full web editor (live preview, wikilinks, graph, Kanban boards, calendar, community-style plugins).

---

## Contents

| # | Document | Description |
|---|---|---|
| 1 | [Overview](overview.md) | System summary, tech stack |
| 2 | [Architecture](architecture.md) | Diagrams, request flows, data flows |
| 3 | [Web App](web-app.md) | Frontend features: editor modes, tabs, graph, search, plugins, Kanban, calendar, settings |
| 4 | [Services](services.md) | All 8 Railway services with config details |
| 5 | [Authentication](authentication.md) | Kratos, NextAuth, JWT, middleware |
| 6 | [Security](security.md) | Encryption layers, credential scoping |
| 7 | [Database Schema](database.md) | CouchDB document formats and conventions |
| 8 | [API Reference](api.md) | All API routes with request/response shapes |
| 9 | [Vault Management](vaults.md) | Vault lifecycle, creation, deletion |
| 10 | [Permissions](permissions.md) | Keto model, role capabilities |
| 11 | [Environment Variables](environment.md) | Complete env var reference per service |
| 12 | [Deployment Guide](deployment.md) | Step-by-step Railway deployment |
| 13 | [Limitations & Roadmap](limitations.md) | Known gaps, planned work |

---

## Quick Reference

| Task | Where to look |
|---|---|
| How does login work? | [Authentication → Login Flow](authentication.md#login-flow-step-by-step) |
| Why does admin use the public CouchDB URL? | [Services → couch-db](services.md#couch-db) |
| Why do writes bypass Oathkeeper? | [Authentication → Oathkeeper](authentication.md#how-oathkeeper-validates-requests) |
| Note document format | [Database Schema → Note Parent Document](database.md#note-parent-document) |
| Editor modes (Reading / Live Preview / Source) | [Web App → Editor](web-app.md#editor) |
| How wikilinks / backlinks / graph work | [Web App → Wikilinks & Graph](web-app.md#wikilinks-backlinks-graph) |
| Kanban board markdown format | [Web App → Kanban Plugin](web-app.md#kanban-plugin) |
| Plugin install state model | [Database Schema → Plugin & Settings Documents](database.md#plugin--settings-documents) |
| How are shared vault permissions checked? | [Permissions → API Route Check Flow](permissions.md#how-permissions-are-checked-in-api-routes) |
| LiveSync setup for users | [Vault Management → Credential Provisioning](vaults.md#per-user-couchdb-credential-provisioning) |
| Deploy a service | [Deployment Guide](deployment.md) |
| Add an env var | [Environment Variables](environment.md) |

---

## Repository Layout

```
rexform-obsidian/
├── app/                    Next.js 14 application
│   ├── app/                Pages and API routes (App Router)
│   │   ├── api/            API route handlers
│   │   ├── admin/          Admin panel pages
│   │   ├── notes/          Main workspace: [id] note view, graph, kanban,
│   │   │                   calendar, gitlab, new
│   │   └── settings/       Legacy settings page (settings now open as a modal)
│   ├── components/         UI components
│   │   ├── NotesShell.tsx  Workspace layout: sidebar + tabs + right panel
│   │   ├── NoteViewClient.tsx  Note view: mode switch, single-doc state
│   │   ├── CodeMirrorEditor.tsx  CM6 editor (Live Preview + Source)
│   │   ├── WikiMarkdown.tsx  Reading view renderer (wikilinks, Mermaid)
│   │   ├── KanbanView.tsx / CalendarPanel.tsx / GraphView.tsx
│   │   ├── OutlinePanel.tsx / BacklinksPanel.tsx / SearchModal.tsx
│   │   ├── settings/       SettingsModal (two-pane, plugin browser)
│   │   └── sidebar/        File tree, drag-and-drop, context menus
│   ├── context/            TabsContext, RightPanelContext, SettingsModalContext
│   ├── lib/                Utilities
│   │   ├── auth.ts         NextAuth configuration
│   │   ├── vault.ts        Vault lifecycle + syncVaultSecurity
│   │   ├── couchdb.ts      CouchDB read/write helpers
│   │   ├── keto.ts         Keto permission helpers
│   │   ├── kratos.ts       Kratos API clients
│   │   ├── active-vault.ts resolveVault() central logic
│   │   ├── couchdb-credentials.ts LiveSync credential provisioning
│   │   ├── frontmatter.ts  YAML frontmatter parse/serialize/combine
│   │   ├── kanban.ts       Kanban board markdown parser/serializer
│   │   ├── plugin-registry.ts  Community plugin catalog
│   │   ├── cm/             CodeMirror 6 live preview, theme, wikilink autocomplete
│   │   ├── i18n/           Dependency-free i18n (en / kh)
│   │   └── rehype/         Collapsible-headings rehype plugin
│   └── middleware.ts       Route protection (withAuth)
├── kratos/                 Ory Kratos config + identity schema
├── keto/                   Ory Keto config + Dockerfile
├── oathkeeper/             Oathkeeper config + access rules
└── docs/                   This documentation
```
