export interface NoteEntry { id: string; path: string; isMarker?: boolean }
export interface FileNode { type: 'file'; name: string; id: string; path: string }
export interface FolderNode { type: 'folder'; name: string; path: string; children: TreeNode[] }
export type TreeNode = FileNode | FolderNode

export interface VaultOption { name: string; label: string; role?: string }
export interface VaultsData { vaults: VaultOption[]; activeVault: string }

export interface ContextMenuState {
  x: number;
  y: number;
  type: 'file' | 'folder' | 'root';
  id: string;
  name: string;
  path: string;
  onRename?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onNewNote?: () => void;
  onNewFolder?: () => void;
  onOpenGraph?: () => void;
}

export interface CreatingState { folder: string; type: 'note' | 'folder' }
