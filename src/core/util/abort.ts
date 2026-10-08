import type { Semaphore } from './semaphore';

/** A controller that also aborts when `parent` aborts, so one failure can stop sibling tasks. */
export function linkedAbortController(parent?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (parent?.aborted) controller.abort(parent.reason);
  else parent?.addEventListener('abort', () => controller.abort(parent.reason), { once: true });
  return controller;
}

/**
 * Runs every task through `limiter`; the first failure aborts `controller` and is rethrown.
 * The abort happens inside the limited section, before its slot is released, so no queued
 * task starts after a failure.
 */
export async function runAllOrAbort(
  controller: AbortController,
  limiter: Semaphore,
  tasks: Array<() => Promise<void>>,
): Promise<void> {
  await Promise.all(
    tasks.map((task) =>
      limiter.run(async () => {
        controller.signal.throwIfAborted();
        try {
          await task();
        } catch (error) {
          controller.abort(error);
          throw error;
        }
      }),
    ),
  );
}
