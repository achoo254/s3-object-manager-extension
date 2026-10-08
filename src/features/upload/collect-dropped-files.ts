export interface PickedFile {
  file: File;
  /** Path relative to the drop/pick root, `/`-separated, used to build the object key. */
  relativePath: string;
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await entryFile(entry as FileSystemFileEntry);
    out.push({ file, relativePath: entry.fullPath.replace(/^\/+/, '') });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns at most ~100 entries per call; keep reading until empty.
    for (;;) {
      const batch = await readEntries(reader);
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

/** Files and whole folders from a drop, keeping each file's path inside the dropped folder. */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const entries = [...dataTransfer.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  const out: PickedFile[] = [];
  for (const entry of entries) await walk(entry, out);
  return out;
}

/** Files from `<input type="file">`; folder picks carry `webkitRelativePath`. */
export function collectInputFiles(files: FileList): PickedFile[] {
  return [...files].map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}
