export interface PluginDefinition {
  id: 'kanban' | 'calendar' | 'gitlab';
  name: string;
  description: string;
  /** Markdown "how to use" body shown in the browse detail view. */
  longDescription: string;
  author: string;
  version: string;
  category: 'productivity' | 'integration';
}

export const PLUGIN_REGISTRY: PluginDefinition[] = [
  {
    id: 'kanban',
    name: 'Kanban',
    author: 'REXFORM',
    version: '1.0.0',
    description: 'Organize tasks with drag-and-drop boards',
    category: 'productivity',
    longDescription: `Create markdown-backed Kanban boards to manage tasks and workflows.

## How to use

1. **Enable** the plugin — the Kanban icon appears in the left icon strip.
2. Create a board from the sidebar's **New Kanban board** action.
3. Add columns for your workflow (To do, Doing, Done) and drag cards between them as work progresses.

## Board format

Boards are plain markdown notes, fully portable with Obsidian's Kanban plugin:

\`\`\`markdown
---
kanban-plugin: basic
---

## To do

- [ ] Write the weekly report
- [ ] Review pull requests

## Done

**Complete**
- [x] Set up the vault
\`\`\`

- Each \`## heading\` is a column.
- Each \`- [ ]\` list item is a card; \`- [x]\` marks it done.
- Because boards are just markdown, they sync via LiveSync and open fine in Obsidian.`,
  },
  {
    id: 'calendar',
    name: 'Calendar',
    author: 'REXFORM',
    version: '1.0.0',
    description: 'Navigate and create daily notes by date',
    category: 'productivity',
    longDescription: `Browse your notes on a monthly calendar and create daily notes with one click.

## How to use

1. **Enable** the plugin — the Calendar icon appears in the left icon strip.
2. Click any date to open that day's daily note, or create it if it doesn't exist yet.
3. Days that already have a daily note are highlighted.

## Daily note format

Daily notes are named \`YYYY-MM-DD.md\` and live in your vault like any other note — link to them with \`[[2026-07-02]]\`.`,
  },
  {
    id: 'gitlab',
    name: 'GitLab Work Items',
    author: 'REXFORM',
    version: '1.0.0',
    description: 'Link notes to GitLab issues, epics and milestones',
    category: 'integration',
    longDescription: `Connect your vault to GitLab and reference work items directly from your notes.

## How to use

1. **Enable** the plugin — the GitLab icon appears in the left icon strip.
2. Browse issues, epics and milestones from your configured GitLab projects.
3. Link a note to a work item to keep design docs, meeting notes and research attached to the work they describe.

## Requirements

A GitLab account with access to the REXFORM group. Authentication is handled by your existing session.`,
  },
];
