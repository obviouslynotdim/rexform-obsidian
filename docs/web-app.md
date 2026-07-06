# Web App

The frontend feature reference. Everything here lives under `app/` (Next.js 14 App Router) and talks to the [API routes](api.md); nothing below changes the backend contracts.

---

## Workspace Layout

`NotesShell.tsx` renders the whole workspace as one flex row:

```
┌──────────┬─────────────────────────────┬───────────┐
│ Sidebar  │ Tab bar                     │ Right     │
│          ├─────────────────────────────┤ panel     │
│ vault bar│                             │           │
│ file tree│  Note view / graph / board  │ ▸ Outline │
│          │                             │ ▸ Backlinks│
│          │                             │ ▸ Calendar│
└──────────┴─────────────────────────────┴───────────┘
```

- **Sidebar** (`components/sidebar/`) — vault switcher bar, then the file tree: nested folders, drag-and-drop for notes *and* folders, right-click context menus (new note, new folder, new kanban board, rename, delete), inline rename. Empty folders persist via `.keep` marker docs (see [Database Schema](database.md#folder-marker-documents)).
- **Tabs** (`TabBar.tsx`, `context/TabsContext.tsx`) — open notes as tabs; tab state is isolated per vault, and switching vaults stays on `/notes`.
- **Right panel** (`context/RightPanelContext.tsx`) — a real flex column (not an overlay) with icon tabs: **Outline** (`OutlinePanel.tsx` — nested heading tree with guide lines, click to scroll), **Backlinks** (`BacklinksPanel.tsx`), and **Calendar** (`CalendarPanel.tsx`). Closed by default.
- Both the sidebar and the right panel are **resizable** by dragging their edges.
- **Note ⋮ menu** (`NoteMenu.tsx`) — per-note dropdown in the note header (open in tab, delete, etc.).

### Pages under `/notes`

| Route | Purpose |
|---|---|
| `/notes` | Workspace landing; first-time users get an onboarding graph + welcome view |
| `/notes/[id]` | Note view (see Editor) |
| `/notes/graph` | Vault-wide D3 knowledge graph (also folder-scoped via query param) |
| `/notes/kanban` | Kanban board launcher + board view |
| `/notes/calendar` | Full-page calendar |
| `/notes/gitlab` | GitLab Work Items plugin page |
| `/notes/new` | Creates an Obsidian-style `Untitled.md` and opens it in Source mode |

---

## Editor

`NoteViewClient.tsx` owns a **single source of truth**: one raw markdown string (`doc`) from which the Properties panel, Source editor, Live Preview, and Reading view all derive. Three modes:

| Mode | Renderer | Notes |
|---|---|---|
| **Reading** | `WikiMarkdown.tsx` (react-markdown + remark-gfm) | Wikilinks rendered as links, Mermaid code blocks rendered as diagrams, collapsible headings (fold chevrons via the `lib/rehype/collapsible-headings.ts` plugin), Properties panel for frontmatter |
| **Live Preview** | `CodeMirrorEditor.tsx` + `lib/cm/livePreview.ts` | CM6 inline WYSIWYG — markdown syntax hides on the inactive line, Obsidian-style |
| **Source** | `CodeMirrorEditor.tsx` | Raw markdown including raw YAML frontmatter (Properties panel hidden) |

Other editor behaviour:

- **Frontmatter** — `lib/frontmatter.ts` parses/serializes/combines YAML frontmatter so saves never lose properties; inline arrays and quoted strings round-trip. Reading view shows it as a collapsible **Properties** panel.
- **Wikilink autocomplete** — `lib/cm/wikilinkComplete.ts` completes `[[` against vault note titles.
- **Title model** — the body's first `# H1` is the note title (no separate title bar); the breadcrumb filename is click-to-rename. Optional bidirectional heading↔filename sync is a user setting (default off).
- **Keyboard** — `Ctrl+K` quick switcher, `Ctrl+E` toggles editing/reading.
- Note column is capped at 860px for readability.

---

## Wikilinks, Backlinks, Graph

- `[[Note Name]]` links resolve by filename — case-insensitive, `-`/`_` treated as spaces, `.md` optional; `#heading` and `|alias` suffixes supported.
- **Backlinks** — right-panel tab backed by `GET /api/notes/[id]/backlinks`, with a snippet of the linking context.
- **Rename safety** — renaming a note rewrites `[[links]]` to it across the vault (best-effort, background). Folder renames do not (see [Limitations](limitations.md)).
- **Graph** — `GraphView.tsx`, a D3 force-directed graph from `GET /api/notes/graph`; node size reflects link count; can be scoped to a folder from the folder context menu.

---

## Search

`SearchModal.tsx` — `Ctrl+K` (or the search icon in the sidebar icon strip) opens an Obsidian-style quick switcher backed by `GET /api/search`: full-text over titles, paths, and body content with match-type badges and snippets.

---

## Plugins

An Obsidian-style community plugin system, entirely native (plugins are built into the app; real Obsidian plugins cannot run in the browser).

- **Catalog** — `lib/plugin-registry.ts`: `kanban`, `calendar` (productivity), `livesync`, `gitlab` (integration), each with name/description/longDescription/author/version.
- **Browse & install** — Settings modal → Community plugins: browse list, detail view with markdown long-description, install button with spinner + progress toast. Installed plugins can be toggled enabled/disabled or uninstalled.
- **State** — `{ installed: string[], enabled: Record<string, boolean> }` persisted per user via `/api/user/plugins` (see [Database Schema](database.md#plugin--settings-documents)).

### Kanban Plugin

Markdown-backed boards, byte-compatible with Obsidian's community Kanban plugin (`kanban-plugin` frontmatter key, `##` columns, `- [ ]` cards — format in [Database Schema](database.md#kanban-board-notes)).

- `KanbanView.tsx` — drag-and-drop cards and columns (`@hello-pangea/dnd`); add/edit/delete cards; dropping into a `**Complete**` column checks the card.
- A note with the `kanban-plugin` frontmatter key renders as a board in Reading mode (full pane width); Source/Live modes show the underlying markdown as usual.
- `/notes/kanban` lists all boards via `GET /api/kanban/boards`; new boards come from the sidebar/context-menu "New kanban board" (starter To do / Doing / Done template).

### Calendar Plugin

`CalendarPanel.tsx` — Obsidian Calendar-style daily notes: a month grid where days with a daily note (a note named `YYYY-MM-DD.md` anywhere in the vault) are dotted and open it; other days offer to create one. Available as a right-panel tab and full-page at `/notes/calendar`.

### GitLab Work Items Plugin

`/notes/gitlab` — GitLab issue/work-item integration page.

### Self-hosted LiveSync Plugin

Surfaces the per-user CouchDB credentials and sync setup (see [Vault Management](vaults.md)) as an installable plugin instead of a hardcoded settings section.

---

## Settings

`components/settings/SettingsModal.tsx` — an Obsidian-style modal overlay (not a page) with a two-pane layout: section nav on the left, content on the right. Sections include Files & Links (heading↔filename sync, default new-note location), Language, Sync (LiveSync credentials), and Community plugins.

- Opened from anywhere via `context/SettingsModalContext.tsx`.
- Preferences persist per user via `/api/user/settings`: `{ syncHeadingWithFilename, newNoteLocation, language }`.
- **i18n** — dependency-free scaffold in `lib/i18n/` with `en` and `kh` (Khmer) locales.

---

## Onboarding

First-time users (fresh vault) land on a welcome view with a mini graph and a getting-started empty state; login and registration redirect to `/notes`. Starter notes are seeded at vault creation (`lib/starter-notes.ts`).
