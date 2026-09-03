import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProjectsFindFirst = vi.fn();
const mockUsersFindFirst = vi.fn();
const mockProjectMembersFindMany = vi.fn();
const mockTeamMembersFindMany = vi.fn();

vi.mock('$lib/db', () => ({
	db: {
		query: {
			projects: { findFirst: (...args: unknown[]) => mockProjectsFindFirst(...args) },
			users: { findFirst: (...args: unknown[]) => mockUsersFindFirst(...args) },
			projectMembers: { findMany: (...args: unknown[]) => mockProjectMembersFindMany(...args) },
			teamMembers: { findMany: (...args: unknown[]) => mockTeamMembersFindMany(...args) }
		}
	}
}));

import { collectProjectNotificationEmails } from '$lib/notifications/collect-recipients';

const PROJECT = { userId: 'owner-1', teamId: null };

function teamMember(email: string, role: string) {
	return { user: { email } , role };
}

describe('collectProjectNotificationEmails', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockProjectsFindFirst.mockResolvedValue(PROJECT);
		mockProjectMembersFindMany.mockResolvedValue([]);
		mockTeamMembersFindMany.mockResolvedValue([]);
		mockUsersFindFirst.mockResolvedValue({ email: 'owner@example.com' });
	});

	it('includes the project owner email', async () => {
		const emails = await collectProjectNotificationEmails('project-1');
		expect(emails).toEqual(['owner@example.com']);
	});

	it('returns empty when project does not exist', async () => {
		mockProjectsFindFirst.mockResolvedValue(null);
		const emails = await collectProjectNotificationEmails('nope');
		expect(emails).toEqual([]);
	});

	it('includes project members whose role meets the minimum', async () => {
		mockProjectMembersFindMany.mockResolvedValue([
			{ user: { email: 'editor@example.com' }, role: 'editor' },
			{ user: { email: 'viewer@example.com' }, role: 'viewer' }
		]);

		const emails = await collectProjectNotificationEmails('project-1', 'editor');
		expect(emails).toContain('owner@example.com');
		expect(emails).toContain('editor@example.com');
		expect(emails).not.toContain('viewer@example.com');
	});

	it('defaults to viewer so everyone with access is included (null minRole)', async () => {
		mockProjectMembersFindMany.mockResolvedValue([
			{ user: { email: 'viewer@example.com' }, role: 'viewer' }
		]);

		const emails = await collectProjectNotificationEmails('project-1');
		expect(emails).toContain('viewer@example.com');
	});

	it('includes team members for projects belonging to a team', async () => {
		mockProjectsFindFirst.mockResolvedValue({ userId: 'owner-1', teamId: 'team-1' });
		mockTeamMembersFindMany.mockResolvedValue([
			teamMember('teamowner@example.com', 'team_owner'),
			teamMember('teamadmin@example.com', 'team_admin'),
			teamMember('teammember@example.com', 'team_member')
		]);

		const emails = await collectProjectNotificationEmails('project-1');
		expect(emails).toContain('teamowner@example.com');
		expect(emails).toContain('teamadmin@example.com');
		expect(emails).toContain('teammember@example.com');
	});

	it('applies the editor minimum to team roles (owner/admin but not member)', async () => {
		mockProjectsFindFirst.mockResolvedValue({ userId: 'owner-1', teamId: 'team-1' });
		mockTeamMembersFindMany.mockResolvedValue([
			teamMember('teamadmin@example.com', 'team_admin'),
			teamMember('teammember@example.com', 'team_member')
		]);

		const emails = await collectProjectNotificationEmails('project-1', 'editor');
		expect(emails).toContain('teamadmin@example.com');
		expect(emails).not.toContain('teammember@example.com');
	});

	it('deduplicates emails case-insensitively', async () => {
		mockUsersFindFirst.mockResolvedValue({ email: '  Owner@Example.com  ' });
		mockProjectMembersFindMany.mockResolvedValue([
			{ user: { email: ' owner@example.com ' }, role: 'viewer' }
		]);

		const emails = await collectProjectNotificationEmails('project-1');
		expect(emails).toEqual(['owner@example.com']);
	});
});
