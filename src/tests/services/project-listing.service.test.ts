import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectListingService } from '../../lib/services/project-listing.service';
import { PM2Service } from '../../lib/pm2/pm2.service';
import type { IPM2Repository, ProcessWithStatus, PM2Process } from '../../lib/pm2/pm2.types';
import type { IProjectRepository, Project } from '../../lib/projects/project.types';
import type { ITeamRepository, Team } from '../../lib/db/repositories/team-repository.interface';

// Mock factories following existing patterns
function createMockPM2Repo(overrides: Partial<IPM2Repository> = {}): IPM2Repository {
	return {
		list: vi.fn().mockResolvedValue([]),
		describe: vi.fn().mockResolvedValue(null),
		restart: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		getLogs: vi.fn().mockResolvedValue([]),
		...overrides
	};
}

function createMockProjectRepo(overrides: Partial<IProjectRepository> = {}): IProjectRepository {
	return {
		getAll: vi.fn().mockResolvedValue([]),
		getById: vi.fn().mockResolvedValue(null),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		getByUserId: vi.fn().mockResolvedValue([]),
		findByAccess: vi.fn().mockResolvedValue([]),
		...overrides
	};
}

function createMockTeamRepo(overrides: Partial<ITeamRepository> = {}): ITeamRepository {
	return {
		findById: vi.fn().mockResolvedValue(null),
		findAll: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		addMember: vi.fn(),
		removeMember: vi.fn(),
		updateMemberRole: vi.fn(),
		countOwners: vi.fn(),
		findMember: vi.fn(),
		getUserTeams: vi.fn().mockResolvedValue([]),
		...overrides
	};
}

// Helper to create a raw PM2 process (what the repository returns)
function createPM2Process(overrides: Partial<PM2Process> = {}): PM2Process {
	return {
		name: 'test-app',
		pm_id: 1,
		monit: { cpu: 10, memory: 1024 * 1024 },
		pm2_env: { status: 'online', pm_uptime: Date.now() - 3600000, restart_time: 0 },
		...overrides
	};
}

// Helper to create a DB project
function createDBProject(overrides: Partial<Project> = {}): Project {
	return {
		id: 'uuid-123',
		userId: 'user-456',
		teamId: null,
		name: 'Test Project',
		pm2Name: 'test-app',
		description: null,
		createdAt: new Date(),
		...overrides
	};
}

describe('ProjectListingService', () => {
	let service: ProjectListingService;
	let mockPM2Repo: IPM2Repository;
	let mockPM2Service: PM2Service;
	let mockProjectRepo: IProjectRepository;
	let mockTeamRepo: ITeamRepository;

	beforeEach(() => {
		mockPM2Repo = createMockPM2Repo();
		mockPM2Service = new PM2Service(mockPM2Repo);
		mockProjectRepo = createMockProjectRepo();
		mockTeamRepo = createMockTeamRepo();
		service = new ProjectListingService(mockPM2Service, mockProjectRepo, mockTeamRepo);
	});

	describe('getVisibleProjects', () => {
		describe('admin user', () => {
			it('should return all processes without filtering', async () => {
				const processes = [
					createPM2Process({ name: 'app1', pm_id: 1 }),
					createPM2Process({ name: 'app2', pm_id: 2 })
				];
				vi.mocked(mockPM2Repo.list).mockResolvedValue(processes);

				const result = await service.getVisibleProjects('admin-user', 'admin');

				expect(result).toHaveLength(2);
				expect(result[0].accessType).toBe('admin');
				expect(result[1].accessType).toBe('admin');
				// Verify no filtering was applied - getAllProcesses called once
				expect(mockPM2Repo.list).toHaveBeenCalledTimes(1);
				// findByAccess should NOT be called for admin
				expect(mockProjectRepo.findByAccess).not.toHaveBeenCalled();
			});
		});

		describe('non-admin user with project access', () => {
			it('should filter processes by pm2Name match', async () => {
				// User has access to a project with pm2Name 'my-app'
				const dbProjects = [
					createDBProject({
						id: 'proj-1',
						pm2Name: 'my-app',
						userId: 'user-123'
					})
				];
				vi.mocked(mockProjectRepo.findByAccess).mockResolvedValue(dbProjects);

				// PM2 has processes: 'my-app' (should match) and 'other-app' (should NOT match)
				const pm2Processes = [
					createPM2Process({ name: 'my-app', pm_id: 1 }),
					createPM2Process({ name: 'other-app', pm_id: 2 })
				];
				vi.mocked(mockPM2Repo.list).mockResolvedValue(pm2Processes);

				const result = await service.getVisibleProjects('user-123', 'user');

				// Only 'my-app' should be in the result
				expect(result).toHaveLength(1);
				expect(result[0].name).toBe('my-app');
				expect(result[0].accessType).toBe('personal');
			});

			it('should return empty array when no pm2Name matches', async () => {
				// User has access to a project with pm2Name 'my-app'
				const dbProjects = [
					createDBProject({
						id: 'proj-1',
						pm2Name: 'my-app',
						userId: 'user-123'
					})
				];
				vi.mocked(mockProjectRepo.findByAccess).mockResolvedValue(dbProjects);

				// PM2 has a process with different name
				const pm2Processes = [
					createPM2Process({ name: 'orphan-process', pm_id: 99 })
				];
				vi.mocked(mockPM2Repo.list).mockResolvedValue(pm2Processes);

				const result = await service.getVisibleProjects('user-123', 'user');

				// No processes should match
				expect(result).toEqual([]);
			});

			it('should handle multiple projects with different access types', async () => {
				// User has access to multiple projects:
				// - personal project (userId matches)
				// - team project (teamId set)
				const dbProjects = [
					createDBProject({
						id: 'proj-1',
						pm2Name: 'personal-app',
						userId: 'user-123',
						teamId: null
					}),
					createDBProject({
						id: 'proj-2',
						pm2Name: 'team-app',
						userId: 'other-user',
						teamId: 'team-1'
					})
				];
				vi.mocked(mockProjectRepo.findByAccess).mockResolvedValue(dbProjects);

				const pm2Processes = [
					createPM2Process({ name: 'personal-app', pm_id: 1 }),
					createPM2Process({ name: 'team-app', pm_id: 2 }),
					createPM2Process({ name: 'no-access-app', pm_id: 3 })
				];
				vi.mocked(mockPM2Repo.list).mockResolvedValue(pm2Processes);

				const userTeams: Team[] = [{ id: 'team-1', name: 'Dev Team', description: null, createdAt: new Date() }];
				vi.mocked(mockTeamRepo.getUserTeams).mockResolvedValue(userTeams);

				const result = await service.getVisibleProjects('user-123', 'user');

				expect(result).toHaveLength(2);
				expect(result.find(p => p.name === 'personal-app')?.accessType).toBe('personal');
				expect(result.find(p => p.name === 'team-app')?.accessType).toBe('team');
			});
		});

		describe('user with no project access', () => {
			it('should return empty array when user has no accessible projects', async () => {
				// User has no project access
				vi.mocked(mockProjectRepo.findByAccess).mockResolvedValue([]);

				// PM2 has processes running
				const pm2Processes = [
					createPM2Process({ name: 'app1', pm_id: 1 })
				];
				vi.mocked(mockPM2Repo.list).mockResolvedValue(pm2Processes);

				const result = await service.getVisibleProjects('user-123', 'user');

				expect(result).toEqual([]);
			});
		});
	});
});
