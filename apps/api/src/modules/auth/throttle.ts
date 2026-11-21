const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface Bucket {
  count: number;
  startedAt: number;
}

export interface LockState {
  locked: boolean;
  retryAfterSeconds: number;
}

/**
 * In-memory PIN throttle. One shop runs on one process, so a process-local
 * counter is enough; a restart clears it and that only ever favours the owner.
 */
export class PinThrottle {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  check(key: string): LockState {
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return { locked: false, retryAfterSeconds: 0 };
    }

    const elapsed = this.now() - bucket.startedAt;

    if (elapsed >= WINDOW_MS) {
      this.buckets.delete(key);
      return { locked: false, retryAfterSeconds: 0 };
    }

    if (bucket.count < MAX_ATTEMPTS) {
      return { locked: false, retryAfterSeconds: 0 };
    }

    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000)),
    };
  }

  recordFailure(key: string): void {
    const bucket = this.buckets.get(key);

    if (!bucket || this.now() - bucket.startedAt >= WINDOW_MS) {
      this.buckets.set(key, { count: 1, startedAt: this.now() });
      return;
    }

    bucket.count += 1;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  clear(): void {
    this.buckets.clear();
  }
}
