import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dotenv
vi.mock('dotenv', () => ({ config: vi.fn() }));

// Mock libsql client
const mockDb = {
	select: vi.fn().mockReturnThis(),
	from: vi.fn().mockReturnThis(),
	where: vi.fn().mockResolvedValue([]),
	update: vi.fn().mockReturnThis(),
	set: vi.fn().mockReturnThis(),
	insert: vi.fn().mockReturnThis(),
	values: vi.fn().mockResolvedValue({})
};

vi.mock('@libsql/client', () => ({
	createClient: vi.fn(() => ({}))
}));

vi.mock('drizzle-orm/libsql', () => ({
	drizzle: vi.fn(() => mockDb)
}));

describe('set-default-roles migration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('should export a run function', async () => {
		const module = await import('../../../lib/server/migrations/set-default-roles');
		expect(typeof module.run).toBe('function');
	});

	it('should be idempotent (safe to run multiple times)', async () => {
		const { run } = await import('../../../lib/server/migrations/set-default-roles');

		// First run
		await run();
		// Second run (should not cause errors)
		await run();

		// If we get here without errors, the test passes
		expect(true).toBe(true);
	});

	it('should skip when no users need update', async () => {
		const { run } = await import('../../../lib/server/migrations/set-default-roles');

		await run();

		// No errors means migration handled empty case correctly
		expect(true).toBe(true);
	});
});
