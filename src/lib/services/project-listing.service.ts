import { PM2Service } from '$lib/pm2/pm2.service';
import type { IProjectRepository, Project } from '$lib/projects/project.types';
import type { ITeamRepository, Team } from '$lib/db/repositories/team-repository.interface';
import type { ProcessWithStatus } from '$lib/pm2/pm2.types';

export interface VisibleProject extends ProcessWithStatus {
	accessType: 'personal' | 'team' | 'shared' | 'admin';
	teamName?: string;
	dbProject?: Project;
}

/**
 * Service that bridges PM2 processes with database access control.
 * Filters PM2 processes to only show projects the user has access to.
 */
export class ProjectListingService {
	constructor(
		private pm2Service: PM2Service,
		private projectRepo: IProjectRepository,
		private teamRepo: ITeamRepository
	) {}

	/**
	 * Get all projects visible to a user based on their access level.
	 * Admin users see all processes.
	 * Regular users see: personal + team + shared projects.
	 */
	async getVisibleProjects(userId: string, userRole: string): Promise<VisibleProject[]> {
		// Admin sees all processes
		if (userRole === 'admin') {
			const processes = await this.pm2Service.getAllProcesses();
			return processes.map(p => ({
				...p,
				accessType: 'admin' as const
			}));
		}

		// Get user's team memberships
		const userTeams = await this.teamRepo.getUserTeams(userId);
		const teamIds = userTeams.map(t => t.id);
		const teamNameMap = new Map(userTeams.map(t => [t.id, t.name]));

		// Get accessible projects from DB
		const dbProjects = await this.projectRepo.findByAccess({ userId, teamIds });
		const accessibleProjectIds = new Set(dbProjects.map(p => p.id));
		const dbProjectMap = new Map(dbProjects.map(p => [p.id, p]));

		// Get PM2 processes and filter
		const processes = await this.pm2Service.getAllProcesses();

		return processes
			.filter(p => accessibleProjectIds.has(p.pm_id?.toString() ?? ''))
			.map(p => {
				const dbProject = dbProjectMap.get(p.pm_id?.toString() ?? '');
				const accessType = this.determineAccessType(p, dbProject, userId);
				const teamName = dbProject?.teamId ? teamNameMap.get(dbProject.teamId) : undefined;

				return {
					...p,
					accessType,
					teamName,
					dbProject
				};
			});
	}

	private determineAccessType(
		pm2Process: ProcessWithStatus,
		dbProject: Project | undefined,
		userId: string
	): 'personal' | 'team' | 'shared' {
		if (!dbProject) return 'personal'; // Fallback
		if (dbProject.teamId) return 'team';
		if (dbProject.userId === userId) return 'personal';
		return 'shared';
	}
}

/**
 * Factory function to create ProjectListingService with default dependencies.
 */
export function createProjectListingService(): ProjectListingService {
	const { createPM2Services } = await import('$lib/pm2');
	const { ProjectRepository } = await import('$lib/db/repositories/project-repository.impl');
	const { TeamRepository } = await import('$lib/db/repositories/team-repository.impl');

	const { pm2Service } = createPM2Services();
	const projectRepo = new ProjectRepository();
	const teamRepo = new TeamRepository();

	return new ProjectListingService(pm2Service, projectRepo, teamRepo);
}
