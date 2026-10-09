import { computed, reactive, ref, watch } from 'vue';
import { describeS3Error } from '@/core/s3/describe-s3-error';
import { isAbortError } from '@/core/s3/s3-error';
import { abortUpload, uploadFile } from '@/core/upload/multipart-uploader';
import {
  createIndexedDbUploadStateStore,
  uploadStateId,
  type UploadStateStore,
} from '@/core/upload/upload-state-store';
import { Semaphore } from '@/core/util/semaphore';
import { useConnections } from '@/features/connections/use-connections';
import { useSettings } from '@/features/settings/use-settings';
import { useNotify } from '@/features/shared/use-notify';

export type UploadJobStatus = 'queued' | 'running' | 'paused' | 'done' | 'error' | 'cancelled';

export interface UploadJob {
  id: number;
  profileId: string;
  bucket: string;
  key: string;
  file: File;
  status: UploadJobStatus;
  uploadedBytes: number;
  /** Bytes per second over the last few seconds. */
  speed: number;
  resumedParts: number;
  error?: unknown;
}

/** Files uploading at the same time; parts across all of them share the request limit. */
const MAX_ACTIVE_FILES = 4;
const SPEED_WINDOW_MS = 5000;
const FINISHED: readonly UploadJobStatus[] = ['done', 'cancelled'];

const jobs = ref<UploadJob[]>([]);
const store: UploadStateStore = createIndexedDbUploadStateStore();
const limiter = new Semaphore(4);
const controllers = new Map<number, AbortController>();
/** The promise of each running job, so a cancel can wait until it has really stopped. */
const runs = new Map<number, Promise<void>>();
const samples = new Map<number, Array<{ time: number; bytes: number }>>();
const completedListeners = new Set<(job: UploadJob) => void>();
let nextId = 1;

const { settings } = useSettings();
watch(
  () => settings.uploadConcurrency,
  (limit) => limiter.setLimit(limit),
  { immediate: true },
);

const isBusy = computed(() =>
  jobs.value.some((job) => job.status === 'running' || job.status === 'queued'),
);

function stateIdOf(job: UploadJob): string {
  return uploadStateId(
    { profileId: job.profileId, bucket: job.bucket, key: job.key },
    { name: job.file.name, size: job.file.size, lastModified: job.file.lastModified },
  );
}

function recordSpeed(job: UploadJob, bytes: number) {
  const now = Date.now();
  const list = (samples.get(job.id) ?? []).filter((s) => now - s.time <= SPEED_WINDOW_MS);
  list.push({ time: now, bytes });
  samples.set(job.id, list);
  const first = list[0];
  job.speed = first && now > first.time ? ((bytes - first.bytes) * 1000) / (now - first.time) : 0;
}

/**
 * The client is looked up when the job starts, never kept by the queue: a profile that was
 * edited or deleted must not keep uploading with old credentials.
 */
function currentClient(profileId: string) {
  const connections = useConnections();
  const profile = connections.profiles.value.find((p) => p.id === profileId);
  return profile ? connections.clientFor(profile) : undefined;
}

async function runJob(job: UploadJob) {
  const client = currentClient(job.profileId);
  if (!client) {
    job.status = 'paused';
    return;
  }
  const controller = new AbortController();
  controllers.set(job.id, controller);
  job.status = 'running';
  job.error = undefined;
  samples.delete(job.id);
  try {
    const outcome = await uploadFile(
      client,
      job.file,
      { profileId: job.profileId, bucket: job.bucket, key: job.key },
      {
        store,
        limiter,
        signal: controller.signal,
        onProgress: (bytes) => {
          job.uploadedBytes = bytes;
          recordSpeed(job, bytes);
        },
      },
    );
    if (job.status !== 'running') return;
    job.resumedParts = outcome.resumedParts;
    job.uploadedBytes = job.file.size;
    job.status = 'done';
    for (const listener of completedListeners) listener(job);
  } catch (error) {
    if (job.status === 'running') {
      job.status = isAbortError(error) ? 'paused' : 'error';
      job.error = isAbortError(error) ? undefined : error;
    }
  } finally {
    controllers.delete(job.id);
    job.speed = 0;
  }
}

function start(job: UploadJob) {
  const run = runJob(job).finally(() => {
    runs.delete(job.id);
    schedule();
  });
  runs.set(job.id, run);
}

function schedule() {
  const running = jobs.value.filter((job) => job.status === 'running').length;
  const queued = jobs.value.filter((job) => job.status === 'queued');
  for (const job of queued.slice(0, Math.max(0, MAX_ACTIVE_FILES - running))) start(job);
}

function pause(job: UploadJob) {
  if (job.status === 'queued') job.status = 'paused';
  controllers.get(job.id)?.abort();
}

function resume(job: UploadJob) {
  if (job.status === 'paused' || job.status === 'error') {
    job.status = 'queued';
    schedule();
  }
}

/** Cancels for good: waits for the job to stop, then aborts the upload on the server. */
async function cancel(job: UploadJob) {
  job.status = 'cancelled';
  controllers.get(job.id)?.abort();
  await runs.get(job.id)?.catch(() => undefined);
  const client = currentClient(job.profileId);
  try {
    const saved = await store.get(stateIdOf(job));
    if (client && saved) await abortUpload(client, saved, store);
  } catch (error) {
    const description = describeS3Error(error);
    useNotify().notify(description.title, description.params, 'error');
  }
}

export interface UploadRequest {
  file: File;
  key: string;
}

export function useUploadQueue() {
  return {
    jobs,
    isBusy,
    store,
    /**
     * Adds uploads. The same file to the same key is never queued twice: if it is already
     * paused or failed it is resumed (with the file just picked), otherwise left alone.
     */
    enqueue(profileId: string, bucket: string, requests: UploadRequest[]) {
      for (const request of requests) {
        const existing = jobs.value.find(
          (job) =>
            !FINISHED.includes(job.status) &&
            job.profileId === profileId &&
            job.bucket === bucket &&
            job.key === request.key &&
            job.file.name === request.file.name &&
            job.file.size === request.file.size &&
            job.file.lastModified === request.file.lastModified,
        );
        if (existing) {
          if (existing.status === 'paused' || existing.status === 'error') {
            existing.file = request.file;
            existing.status = 'queued';
          }
          continue;
        }
        const job = reactive<UploadJob>({
          id: nextId++,
          profileId,
          bucket,
          key: request.key,
          file: request.file,
          status: 'queued',
          uploadedBytes: 0,
          speed: 0,
          resumedParts: 0,
        }) as UploadJob;
        jobs.value.push(job);
      }
      schedule();
    },
    /** Stops sending; the multipart state stays saved so `resume` continues where it was. */
    pause,
    resume,
    cancel,
    /** The queue job uploading the file a saved state belongs to, if any. */
    jobForState(stateId: string): UploadJob | undefined {
      return jobs.value.find((job) => !FINISHED.includes(job.status) && stateIdOf(job) === stateId);
    },
    clearFinished() {
      jobs.value = jobs.value.filter((job) => !FINISHED.includes(job.status));
    },
    onCompleted(listener: (job: UploadJob) => void): () => void {
      completedListeners.add(listener);
      return () => completedListeners.delete(listener);
    },
  };
}
