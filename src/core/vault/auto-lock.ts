import { browser } from 'wxt/browser';
import { isUnlocked, lockVault } from './vault-store';

/**
 * Locks the vault after a period without user activity. The last-activity time lives in
 * session storage, so activity in any manager tab counts and a tab reopened after the
 * timeout finds the vault locked.
 */
const ACTIVITY_STORAGE_KEY = 'vaultLastActivity';
const ACTIVITY_WRITE_INTERVAL_MS = 15_000;
const CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'dragover'] as const;

export function isIdleExpired(lastActivity: number, minutes: number, now: number): boolean {
  return now - lastActivity >= minutes * 60_000;
}

export async function recordActivity(now: number = Date.now()): Promise<void> {
  await browser.storage.session.set({ [ACTIVITY_STORAGE_KEY]: now });
}

async function readLastActivity(): Promise<number | undefined> {
  const stored = await browser.storage.session.get(ACTIVITY_STORAGE_KEY);
  const value = stored[ACTIVITY_STORAGE_KEY];
  return typeof value === 'number' ? value : undefined;
}

export interface AutoLockOptions {
  minutes: () => number;
  /** While true (e.g. uploads running) the vault is not locked for inactivity. */
  isBusy: () => boolean;
  onLocked: () => void;
}

/** Returns a function that stops watching. */
export function startAutoLock(options: AutoLockOptions): () => void {
  let lastWrite = 0;
  const onActivity = () => {
    const now = Date.now();
    if (now - lastWrite < ACTIVITY_WRITE_INTERVAL_MS) return;
    lastWrite = now;
    void recordActivity(now);
  };
  const check = async () => {
    if (!(await isUnlocked())) return;
    if (options.isBusy()) {
      await recordActivity();
      return;
    }
    const last = await readLastActivity();
    if (last !== undefined && isIdleExpired(last, options.minutes(), Date.now())) {
      await lockVault();
      options.onLocked();
    }
  };
  for (const event of ACTIVITY_EVENTS)
    window.addEventListener(event, onActivity, { passive: true });
  const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
  void check();
  return () => {
    for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
    window.clearInterval(timer);
  };
}
