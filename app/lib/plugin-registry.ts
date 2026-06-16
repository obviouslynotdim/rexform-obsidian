export interface PluginDefinition {
  id: 'kanban' | 'calendar' | 'gitlab';
  name: string;
  description: string;
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
  },
  {
    id: 'calendar',
    name: 'Calendar',
    author: 'REXFORM',
    version: '1.0.0',
    description: 'Navigate and create daily notes by date',
    category: 'productivity',
  },
  {
    id: 'gitlab',
    name: 'GitLab Work Items',
    author: 'REXFORM',
    version: '1.0.0',
    description: 'Link notes to GitLab issues, epics and milestones',
    category: 'integration',
  },
];
