import { ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue';
import { entryName, type BrowserEntry, type FolderEntry, type ObjectEntry } from './object-entry';

const PAGE_SIZE = 1000;
const FILTER_DEBOUNCE_MS = 300;

/**
 * One folder level of a bucket (`Delimiter: '/'`), 1,000 keys per request, more pages loaded
 * on demand. The name filter is sent to the server as part of `Prefix`, never applied to a
 * partially loaded list.
 */
export function useObjectListing(
  client: () => S3Client,
  bucket: Ref<string>,
  prefix: Ref<string>,
  filter: Ref<string>,
) {
  const folders = shallowRef<FolderEntry[]>([]);
  const objects = shallowRef<ObjectEntry[]>([]);
  const loading = ref(false);
  const error = ref<unknown>();
  const continuationToken = ref<string>();
  const hasMore = ref(false);
  /** Requests sent for the current folder (for the performance check). */
  const requestCount = ref(0);
  let generation = 0;
  /**
   * After a reload the old rows stay on screen until the first new page arrives, so a refresh
   * neither flashes an empty list nor closes a menu the user has open.
   */
  let replaceOnNextPage = false;

  const entries = computed<BrowserEntry[]>(() => [...folders.value, ...objects.value]);

  async function fetchPage(currentGeneration: number) {
    loading.value = true;
    error.value = undefined;
    try {
      requestCount.value++;
      const page = await client().send(
        new ListObjectsV2Command({
          Bucket: bucket.value,
          Prefix: prefix.value + filter.value,
          Delimiter: '/',
          MaxKeys: PAGE_SIZE,
          ContinuationToken: continuationToken.value,
        }),
      );
      if (currentGeneration !== generation) return;
      const newFolders = (page.CommonPrefixes ?? []).flatMap((p): FolderEntry[] =>
        p.Prefix
          ? [{ kind: 'folder', key: p.Prefix, name: entryName(p.Prefix, prefix.value) }]
          : [],
      );
      const newObjects = (page.Contents ?? []).flatMap((item): ObjectEntry[] =>
        // The zero-byte `folder/` marker object is the folder itself, not an entry in it.
        item.Key && item.Key !== prefix.value
          ? [
              {
                kind: 'object',
                key: item.Key,
                name: entryName(item.Key, prefix.value),
                size: item.Size ?? 0,
                lastModified: item.LastModified,
                storageClass: item.StorageClass,
              },
            ]
          : [],
      );
      if (replaceOnNextPage) {
        replaceOnNextPage = false;
        folders.value = newFolders;
        objects.value = newObjects;
      } else {
        folders.value = [...folders.value, ...newFolders];
        objects.value = [...objects.value, ...newObjects];
      }
      continuationToken.value = page.IsTruncated ? page.NextContinuationToken : undefined;
      hasMore.value = Boolean(continuationToken.value);
    } catch (e) {
      if (currentGeneration === generation) error.value = e;
    } finally {
      if (currentGeneration === generation) loading.value = false;
    }
  }

  /** `keepRows`: same folder refreshed, so keep showing the current rows until new ones arrive. */
  function reload(keepRows = false): Promise<void> {
    generation++;
    replaceOnNextPage = keepRows;
    if (!keepRows) {
      folders.value = [];
      objects.value = [];
    }
    continuationToken.value = undefined;
    hasMore.value = false;
    requestCount.value = 0;
    if (!bucket.value) return Promise.resolve();
    return fetchPage(generation);
  }

  function loadMore(): Promise<void> {
    if (loading.value || !hasMore.value) return Promise.resolve();
    return fetchPage(generation);
  }

  watch([bucket, prefix], () => void reload(), { immediate: true });
  let filterTimer: ReturnType<typeof setTimeout> | undefined;
  watch(filter, () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => void reload(), FILTER_DEBOUNCE_MS);
  });

  onScopeDispose(() => {
    clearTimeout(filterTimer);
    generation++;
  });

  return { entries, folders, objects, loading, error, hasMore, requestCount, reload, loadMore };
}
