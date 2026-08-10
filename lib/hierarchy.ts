export const FOLDER_TYPES = ['Plant', 'Unit', 'Area', 'System', 'Machine Group', 'Custom Folder'] as const;
export type FolderType = (typeof FOLDER_TYPES)[number];

export type ProjectNode = {
  id: string;
  name: string;
  code: string;
  description: string;
};

export type FolderNode = {
  id: string;
  projectId: string;
  name: string;
  type: FolderType;
  code: string;
  description: string;
  // null = directly under the project root.
  parentId: string | null;
};

export type SelectedNode =
  | { kind: 'project'; id: string }
  | { kind: 'folder'; id: string }
  | { kind: 'devices' }
  | { kind: 'simulation' }
  | { kind: 'device'; id: string }
  | { kind: 'machine'; id: string }
  | { kind: 'none' };

export function folderPath(folders: FolderNode[], folderId: string): FolderNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: FolderNode[] = [];
  let current = byId.get(folderId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** A folder's own id plus every descendant's id — used to block moving/nesting a folder into itself. */
export function folderSubtreeIds(folders: FolderNode[], folderId: string): Set<string> {
  const ids = new Set<string>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Clone a folder and every descendant, reparenting the clone of the root under `newParentId`. */
export function duplicateFolderSubtree(
  folders: FolderNode[],
  rootId: string,
  newParentId: string | null,
  makeId: () => string,
): FolderNode[] {
  const subtreeIds = folderSubtreeIds(folders, rootId);
  const originals = folders.filter((f) => subtreeIds.has(f.id));
  const idMap = new Map(originals.map((f) => [f.id, makeId()]));

  return originals.map((f) => ({
    ...f,
    id: idMap.get(f.id)!,
    parentId: f.id === rootId ? newParentId : (f.parentId ? (idMap.get(f.parentId) ?? null) : null),
    name: f.id === rootId ? `${f.name} (Copy)` : f.name,
  }));
}

/** Clone a project and its entire folder tree under a new project id. */
export function duplicateProject(
  project: ProjectNode,
  folders: FolderNode[],
  makeId: () => string,
): { project: ProjectNode; folders: FolderNode[] } {
  const newProjectId = makeId();
  const projectFolders = folders.filter((f) => f.projectId === project.id);
  const idMap = new Map(projectFolders.map((f) => [f.id, makeId()]));

  const clones = projectFolders.map((f) => ({
    ...f,
    id: idMap.get(f.id)!,
    projectId: newProjectId,
    parentId: f.parentId ? (idMap.get(f.parentId) ?? null) : null,
  }));

  return { project: { ...project, id: newProjectId, name: `${project.name} (Copy)` }, folders: clones };
}
