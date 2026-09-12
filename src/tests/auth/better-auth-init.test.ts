import { describe, it, expect } from 'vitest';
import { getAuth } from '$lib/auth/auth';

describe('Better Auth initialization', () => {
	it('initializes getAuth() without schema mismatch errors', () => {
		expect(() => getAuth()).not.toThrow();
		const authInstance = getAuth();
		expect(authInstance).toBeDefined();
		expect(authInstance.api).toBeDefined();
	});
});
