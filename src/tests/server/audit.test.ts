import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track inserted values
let insertedValues: any[] = [];

// Mock the database module
vi.mock('$lib/db', () => ({
	db: {
		insert: vi.fn().mockImplementation((table) => ({
			values: vi.fn().mockImplementation((val) => {
				insertedValues.push(val);
				return Promise.resolve();
			})
		}))
	}
}));

// Import after mocking
import { logAudit } from '$lib/server/audit';

describe('logAudit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		insertedValues = [];
	});

	it('should insert audit log with all fields', async () => {
		await logAudit(
			'role_change',
			'user-1',
			'user-2',
			'user',
			'user-2',
			{ from: 'user', to: 'admin' }
		);

		expect(insertedValues).toHaveLength(1);
		
		const valuesArg = insertedValues[0];
		expect(valuesArg.action).toBe('role_change');
		expect(valuesArg.actorId).toBe('user-1');
		expect(valuesArg.targetId).toBe('user-2');
		expect(valuesArg.resourceType).toBe('user');
		expect(valuesArg.resourceId).toBe('user-2');
		expect(valuesArg.details).toBe(JSON.stringify({ from: 'user', to: 'admin' }));
		expect(valuesArg.id).toBeDefined();
		expect(valuesArg.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
	});

	it('should insert audit log with minimal fields', async () => {
		await logAudit('user_login', 'user-1');

		expect(insertedValues).toHaveLength(1);
		
		const valuesArg = insertedValues[0];
		expect(valuesArg.action).toBe('user_login');
		expect(valuesArg.actorId).toBe('user-1');
		expect(valuesArg.targetId).toBeNull();
		expect(valuesArg.resourceType).toBeNull();
		expect(valuesArg.resourceId).toBeNull();
		expect(valuesArg.details).toBeNull();
	});

	it('should insert audit log with JSON string details', async () => {
		const details = { reason: 'Violation of terms', duration: '7 days' };
		
		await logAudit(
			'user_ban',
			'admin-1',
			'user-2',
			'user',
			'user-2',
			details
		);

		const valuesArg = insertedValues[0];
		expect(valuesArg.details).toBe(JSON.stringify(details));
	});

	it('should generate unique IDs for each audit log', async () => {
		await logAudit('action_1', 'user-1');
		await logAudit('action_2', 'user-2');

		expect(insertedValues).toHaveLength(2);
		expect(insertedValues[0].id).toBeDefined();
		expect(insertedValues[1].id).toBeDefined();
		expect(insertedValues[0].id).not.toBe(insertedValues[1].id);
	});

	it('should handle project_member_add action', async () => {
		await logAudit(
			'project_member_add',
			'owner-1',
			'user-2',
			'project',
			'project-1',
			{ role: 'editor' }
		);

		const valuesArg = insertedValues[0];
		expect(valuesArg.action).toBe('project_member_add');
		expect(valuesArg.actorId).toBe('owner-1');
		expect(valuesArg.targetId).toBe('user-2');
		expect(valuesArg.resourceType).toBe('project');
		expect(valuesArg.resourceId).toBe('project-1');
	});

	it('should handle team_create action', async () => {
		await logAudit(
			'team_create',
			'user-1',
			undefined,
			'team',
			'team-1',
			{ name: 'Engineering' }
		);

		const valuesArg = insertedValues[0];
		expect(valuesArg.action).toBe('team_create');
		expect(valuesArg.actorId).toBe('user-1');
		expect(valuesArg.resourceType).toBe('team');
		expect(valuesArg.resourceId).toBe('team-1');
	});
});
