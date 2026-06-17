import type { NoteEntry, FileNode, FolderNode, TreeNode } from './types';

export function buildTree(notes: NoteEntry[]): TreeNode[] {
  const root: FolderNode = { type: 'folder', name: '', path: '', children: [] };
  for (const note of notes) {
    const parts = note.path.split('/');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join('/');
      let folder = cur.children.find((c): c is FolderNode => c.type === 'folder' && c.name === name);
      if (!folder) {
        folder = { type: 'folder', name, path, children: [] };
        cur.children.push(folder);
      }
      cur = folder;
    }
    if (!note.isMarker) {
      const filename = parts[parts.length - 1];
      cur.children.push({ type: 'file', name: filename.replace(/\.md$/i, ''), id: note.id, path: note.path });
    }
  }
  function sort(node: FolderNode) {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    });
    node.children.filter((c): c is FolderNode => c.type === 'folder').forEach(sort);
  }
  sort(root);
  return root.children;
}

export function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
}

export function getAncestorFolders(notePath: string): string[] {
  const parts = notePath.split('/');
  const folders: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    folders.push(parts.slice(0, i).join('/'));
  }
  return folders;
}
