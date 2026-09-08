interface RateLimitEntry {
	count: number;
	resetTime: number;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfter?: number;
}

export class RateLimiter {
	private store = new Map<string, RateLimitEntry>();
	private limit: number;
	private windowMs: number;
	private maxEntries: number;
	private cleanupTimer: ReturnType<typeof setInterval> | null = null;

	constructor(limit: number = 100, windowMs: number = 60000, maxEntries: number = 10000) {
		this.limit = limit;
		this.windowMs = windowMs;
		this.maxEntries = maxEntries;

		// Automatically prune expired keys every window period
		this.cleanupTimer = setInterval(() => {
			this.pruneExpired();
		}, Math.max(windowMs, 30000));
		if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
			this.cleanupTimer.unref();
		}
	}

	private pruneExpired(): void {
		const now = Date.now();
		for (const [key, entry] of this.store) {
			if (now > entry.resetTime) {
				this.store.delete(key);
			}
		}
	}

	check(key: string): RateLimitResult {
		const now = Date.now();
		const entry = this.store.get(key);

		if (!entry || now > entry.resetTime) {
			// Enforce max map size to prevent unbounded memory growth
			if (this.store.size >= this.maxEntries) {
				this.pruneExpired();
				if (this.store.size >= this.maxEntries) {
					// Remove oldest entry if still full
					const firstKey = this.store.keys().next().value;
					if (firstKey !== undefined) this.store.delete(firstKey);
				}
			}

			this.store.set(key, { count: 1, resetTime: now + this.windowMs });
			return { allowed: true, remaining: this.limit - 1 };
		}

		entry.count++;

		if (entry.count > this.limit) {
			const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
			return { allowed: false, remaining: 0, retryAfter };
		}

		return { allowed: true, remaining: this.limit - entry.count };
	}

	reset(key: string): void {
		this.store.delete(key);
	}

	clear(): void {
		this.store.clear();
	}

	destroy(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
		this.store.clear();
	}
}

export const rateLimiter = new RateLimiter();
