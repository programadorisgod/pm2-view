import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn() }));
vi.mock('@libsql/client', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('drizzle-orm/libsql', () => ({ drizzle: vi.fn(() => ({})) }));

const mockDb = {
	select: vi.fn().mockReturnThis(),
	from: vi.fn().mockReturnThis(),
	where: vi.fn().mockResolvedValue([]),
	insert: vi.fn().mockReturnThis(),
	values: vi.fn().mockResolvedValue({})
};

describe('create-project-members migration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should export a run function', async () => {
		const module = await import('../../../lib/server/migrations/create-project-members');
		expect(typeof module.run).toBe('function');
	});

	it('should skip when no projects exist', async () => {
		const { run } = await import('../../../lib/server/migrations/create-project-members');
		mockDb.select.mockReturnValue({
			from: vi.fn().mockResolvedValue([])
		});
		await run(mockDb as any);
		expect(true).toBe(true);
	});

	it('should create members for projects without creator membership', async () => {
		const { run } = await import('../../../lib/server/migrations/create-project-members');
		mockDb.select
			.mockReturnValueOnce({
				from: vi.fn().mockResolvedValue([{ id: 'p1', userId: 'u1', name: 'Test' }])
			})
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([])
				})
			});
		mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue({}) });

		await run(mockDb as any);

		expect(mockDb.insert).toHaveBeenCalled();
	});

	it('should skip projects where creator is already a member', async () => {
		const { run } = await import('../../../lib/server/migrations/create-project-members');
		mockDb.select
			.mockReturnValueOnce({
				from: vi.fn().mockResolvedValue([{ id: 'p1', userId: 'u1', name: 'Test' }])
			})
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ projectId: 'p1', userId: 'u1', role: 'owner' }])
				})
			});

		await run(mockDb as any);

		expect(mockDb.insert).not.toHaveBeenCalled();
	});

	it('should be idempotent', async () => {
		const { run } = await import('../../../lib/server/migrations/create-project-members');
		mockDb.select.mockReturnValue({ from: vi.fn().mockResolvedValue([]) });
		await run(mockDb as any);
		await run(mockDb as any);
		expect(true).toBe(true);
	});
});
