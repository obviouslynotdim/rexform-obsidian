export interface PluginDefinition {
  id: 'kanban' | 'calendar' | 'gitlab' | 'livesync';
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
    id: 'livesync',
    name: 'Self-hosted LiveSync',
    author: 'REXFORM',
    version: '1.0.0',
    description: 'Sync this vault with the Obsidian desktop/mobile app',
    category: 'integration',
    longDescription: `Two-way sync between this web vault and Obsidian, powered by the Self-hosted LiveSync community plugin and this workspace's CouchDB.

## How to use

1. **Enable** the plugin — a **Sync** tab appears in Settings with your personal database credentials.
2. In Obsidian, install the **Self-hosted LiveSync** community plugin.
3. Copy the server URL, database name, username and password from the Sync tab into LiveSync's *Remote Database Configuration*.
4. Edits made here and in Obsidian merge automatically — notes, folders and Kanban boards alike.

## Notes

- Credentials are unique to your account; regenerating the password disconnects existing devices until they're updated.
- Disabling the plugin only hides the Sync tab — devices already syncing keep working.`,
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
