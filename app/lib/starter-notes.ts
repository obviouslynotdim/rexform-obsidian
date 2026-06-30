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

- **Reading / Source / Live Preview modes** — switch how a note is shown. *Reading* displays the rendered note, *Source* shows the raw Markdown, and *Live Preview* renders formatting inline as you type. Press \`Ctrl/Cmd + E\` to toggle between them.
- **The sidebar** — browse, search, create, and organise notes and folders down the left edge of the app.
- **The graph view** — open the graph to see every note as a dot and every [[wikilink]] as a line connecting them. It's the fastest way to rediscover related ideas.

## What you can do

- **Create notes** — write anything, from quick thoughts to detailed research
- **Link between notes** — use [[double brackets]] to create connections between ideas
- **Search** — find anything instantly across your entire vault
- **Sync across devices** — your notes are always up to date

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
| \`[[Note Name]]\` | wikilink |
| \`#tag\` | tag |

## Wikilinks

Connect notes using [[double bracket links]]. Type \`[[\` and a note name to create a link. These links form a web of knowledge across your vault.

## Tags

Add \`#tags\` anywhere in a note to categorise it:

- #idea
- #project/rexform
- #reference

## Organising with Folders

Use folder paths when naming notes:

- \`Projects/My Project.md\`
- \`Journal/2026-06-02.md\`
- \`Resources/Quick Reference.md\`

> **Tip:** Start simple — a flat structure often works better than deep folder hierarchies.
`;

const FIRST_NOTE_CONTENT = `# My First Note

Start writing here...

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
