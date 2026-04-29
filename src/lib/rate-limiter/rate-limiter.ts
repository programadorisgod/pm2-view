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

	constructor(limit: number = 100, windowMs: number = 60000) {
		this.limit = limit;
		this.windowMs = windowMs;
	}

	check(key: string): RateLimitResult {
		const now = Date.now();
		const entry = this.store.get(key);

		if (!entry || now > entry.resetTime) {
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
}

export const rateLimiter = new RateLimiter();
