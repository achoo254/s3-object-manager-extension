/**
 * Progress of multipart uploads, kept in IndexedDB so an upload survives a closed tab or a
 * browser restart. Holds no credentials and no file content.
 */

export interface UploadedPart {
  PartNumber: number;
  ETag: string;
}

export interface FileFingerprint {
  name: string;
  size: number;
  lastModified: number;
}

export interface UploadTarget {
  profileId: string;
  bucket: string;
  key: string;
}

export interface UploadState extends UploadTarget {
  id: string;
  file: FileFingerprint;
  uploadId: string;
  partSize: number;
  parts: UploadedPart[];
  createdAt: number;
  updatedAt: number;
}

export interface UploadStateStore {
  get(id: string): Promise<UploadState | undefined>;
  put(state: UploadState): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<UploadState[]>;
}

const DB_NAME = 's3-object-manager';
const DB_VERSION = 1;
const STORE = 'uploads';

export function uploadStateId(target: UploadTarget, file: FileFingerprint): string {
  return JSON.stringify([
    target.profileId,
    target.bucket,
    target.key,
    file.name,
    file.size,
    file.lastModified,
  ]);
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE, { keyPath: 'id' });
  };
  return promisify(request);
}

export function createIndexedDbUploadStateStore(factory: IDBFactory = indexedDB): UploadStateStore {
  let database: Promise<IDBDatabase> | undefined;
  async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    database ??= openDatabase(factory);
    return (await database).transaction(STORE, mode).objectStore(STORE);
  }
  return {
    async get(id) {
      return promisify((await store('readonly')).get(id) as IDBRequest<UploadState | undefined>);
    },
    async put(state) {
      await promisify((await store('readwrite')).put(state));
    },
    async delete(id) {
      await promisify((await store('readwrite')).delete(id));
    },
    async list() {
      return promisify((await store('readonly')).getAll() as IDBRequest<UploadState[]>);
    },
  };
}
