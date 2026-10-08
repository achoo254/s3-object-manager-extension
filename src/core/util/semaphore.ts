/** Limits how many async tasks run at once (e.g. requests holding a part in memory). */
export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private limit: number) {}

  setLimit(limit: number): void {
    this.limit = limit;
    this.drain();
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.active--;
      this.drain();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private drain(): void {
    while (this.active < this.limit && this.waiting.length > 0) {
      this.active++;
      this.waiting.shift()?.();
    }
  }
}
