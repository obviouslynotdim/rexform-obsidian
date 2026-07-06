export interface StarterDocument {
  _id: string;
  [key: string]: unknown;
}

const WELCOME_CONTENT = `# Welcome to REXFORM Notes

## Your personal knowledge base

REXFORM Notes is your private, secure knowledge base powered by Obsidian under the hood. Everything you write here syncs to your personal vault — only you can see it.

## The REXFORM workflow

Building a knowledge base is a simple loop:

1. **Capture** — write your thoughts as notes
2. **Link** — connect ideas with [[wikilinks]]
3. **Explore** — see connections in the graph view
4. **Repeat** — your knowledge base grows over time

\`\`\`mermaid
graph LR
  A[Capture a note] --> B[Link with wikilinks]
  B --> C[Explore the graph]
  C --> D[Discover connections]
  D --> A
\`\`\`

## Getting around

- **Quick switcher** — press \`Ctrl/Cmd + K\` anywhere to search every note by title or content and jump straight to it.
- **Reading / Source / Live Preview modes** — switch how a note is shown with the toggles in the bottom-right, or press \`Ctrl/Cmd + E\`. *Reading* renders the note, *Source* shows raw Markdown, and *Live Preview* renders formatting inline as you type.
- **The sidebar** — browse, search, create, and organise notes and folders. Right-click files and folders for more actions; drag and drop to reorganise.
- **Tabs** — every note opens in a tab along the top, so you can keep several notes at hand.
- **The graph view** — every note is a dot, every [[wikilink]] a line. It's the fastest way to rediscover related ideas.
- **The right panel** — toggle it from the top-right to see the current note's **outline** and **backlinks**.

## Make it yours with plugins

Open **Settings → Community plugins** to add features when you need them:

- **Kanban** — drag-and-drop task boards stored as plain markdown
- **Calendar** — daily notes on a monthly calendar
- **PDF Export** — save any note as a clean PDF
- **Speech** — read notes aloud, or dictate into the editor
- **Self-hosted LiveSync** — two-way sync with the Obsidian desktop and mobile apps

## What you can do

- **Create notes** — write anything, from quick thoughts to detailed research
- **Link between notes** — type \`[[\` and pick a note; press \`Tab\` or \`Enter\` to accept
- **Search** — find anything instantly across your entire vault
- **Sync across devices** — connect the Obsidian app via the LiveSync plugin

> **Your vault is private — only you can see your notes**

---

*New here? Read the [[Quick Start Guide]] next, or jump straight into [[My First Note]].*
`;

const QUICK_START_CONTENT = `# Quick Start Guide

## Markdown Cheatsheet

| Syntax | Result |
|--------|--------|
| \`# Heading\` | large heading |
| \`## Subheading\` | smaller heading |
| \`**bold**\` | **bold** |
| \`*italic*\` | *italic* |
| \`- item\` | bullet list |
| \`1. item\` | numbered list |
| \`- [ ] task\` | checkbox |
| \`> quote\` | blockquote |
| \`[[Note Name]]\` | wikilink |
| \`#tag\` | tag |

## Keyboard shortcuts

| Keys | Action |
|------|--------|
| \`Ctrl/Cmd + K\` | search all notes (quick switcher) |
| \`Ctrl/Cmd + E\` | toggle Reading ↔ editing mode |
| \`Ctrl/Cmd + S\` | save the current note |
| \`Tab\` / \`Enter\` | accept a \`[[\` link suggestion |
| \`Esc\` | back to Reading mode |

## Wikilinks

Connect notes using [[double bracket links]]. Type \`[[\` and pick a note from the popup. These links form a web of knowledge across your vault — see them all in the **graph view**, and check any note's incoming links in the right panel's **backlinks** tab.

## Properties

Notes can carry structured data (tags, dates, anything) in a **Properties** block at the top. Expand the panel above a note to edit them — they're stored as standard YAML frontmatter, fully compatible with Obsidian.

## Tags

Add \`#tags\` anywhere in a note to categorise it:

- #idea
- #project/rexform
- #reference

## Organising with Folders

Create folders in the sidebar (right-click → **New folder**) and drag notes between them. Renaming or moving notes and folders is safe — links to them update automatically.

> **Tip:** Start simple — a flat structure often works better than deep folder hierarchies.
`;

const FIRST_NOTE_CONTENT = `# My First Note

Start writing here...

## Things to try

- [ ] Click this text to start editing (or press \`Ctrl/Cmd + E\`)
- [ ] Type \`[[\` and link to the [[Welcome to REXFORM Notes]] note
- [ ] Press \`Ctrl/Cmd + K\` and search for "quick start"
- [ ] Open the graph view from the left icon strip
- [ ] Install a plugin in **Settings → Community plugins**

---

*This is your first note in REXFORM Notes. Delete this placeholder and start capturing your ideas!*
`;

interface NoteTemplate {
  title: string;
  content: string;
}

const NOTE_TEMPLATES: NoteTemplate[] = [
  { title: 'Welcome to REXFORM Notes', content: WELCOME_CONTENT },
  { title: 'Quick Start Guide', content: QUICK_START_CONTENT },
  { title: 'My First Note', content: FIRST_NOTE_CONTENT },
];

export function getStarterNotes(): StarterDocument[] {
  const now = Date.now();
  const docs: StarterDocument[] = [];

  for (const note of NOTE_TEMPLATES) {
    const id = `${note.title}.md`;
    const chunkId = `${note.title}.md_c0`;

    docs.push({
      _id: id,
      path: id,
      type: 'plain',
      title: note.title,
      mtime: now,
      children: [chunkId],
    });

    docs.push({
      _id: chunkId,
      data: note.content,
    });
  }

  return docs;
}
