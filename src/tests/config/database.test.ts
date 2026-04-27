import { describe, it, expect } from 'vitest';
import { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } from '../../lib/config/database';

describe('Database Config', () => {
	it('should export TURSO_DATABASE_URL from mock env', () => {
		expect(TURSO_DATABASE_URL).toBe('libsql://test.turso.io');
	});

	it('should export TURSO_AUTH_TOKEN from mock env', () => {
		expect(TURSO_AUTH_TOKEN).toBe('test-token');
	});
});
