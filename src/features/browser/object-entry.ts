export interface FolderEntry {
  kind: 'folder';
  /** Full prefix, ending with `/`. */
  key: string;
  name: string;
}

export interface ObjectEntry {
  kind: 'object';
  key: string;
  name: string;
  size: number;
  lastModified?: Date;
  storageClass?: string;
}

export type BrowserEntry = FolderEntry | ObjectEntry;

/** Display name of a key relative to the folder being shown. */
export function entryName(key: string, prefix: string): string {
  return key.slice(prefix.length);
}

/** `a/b/c.txt` → `a/b/`; top-level keys → `''`. */
export function parentPrefix(key: string): string {
  const trimmed = key.endsWith('/') ? key.slice(0, -1) : key;
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? '' : trimmed.slice(0, slash + 1);
}
