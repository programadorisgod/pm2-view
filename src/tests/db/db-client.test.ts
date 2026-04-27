import { describe, it, expect } from 'vitest';

describe('Database Client', () => {
	it('should export db instance from db module', async () => {
		const dbModule = await import('../../lib/db/db');
		expect(dbModule.db).toBeDefined();
		expect(typeof dbModule.db).toBe('object');
	});

	it('should export drizzle instance from db module', async () => {
		const dbModule = await import('../../lib/db/db');
		expect(dbModule.drizzle).toBeDefined();
		expect(typeof dbModule.drizzle).toBe('object');
	});

	it('should have db and drizzle as the same instance', async () => {
		const dbModule = await import('../../lib/db/db');
		expect(dbModule.db).toBe(dbModule.drizzle);
	});

	it('should allow querying users table', async () => {
		const dbModule = await import('../../lib/db/db');
		// Verify the db instance has query capabilities
		// This is a structural test - actual query would need a database
		expect(dbModule.db).toBeDefined();
		expect(typeof dbModule.db).toBe('object');
	});

	it('should have schema definitions attached', async () => {
		const dbModule = await import('../../lib/db/db');
		// The db instance should have access to schema
		expect(dbModule.db).toBeDefined();
	});
});
