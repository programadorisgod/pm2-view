import { db } from '$lib/db';
import { projects, projectMembers } from '../schema';
import { eq, inArray } from 'drizzle-orm';
import type { IProjectRepository, Project, FindByAccessOptions } from '../../projects/project.types';

export class ProjectRepository implements IProjectRepository {
	async getAll(): Promise<Project[]> {
		return await db.query.projects.findMany();
	}

	async getById(id: string): Promise<Project | null> {
		const project = await db.query.projects.findFirst({
			where: eq(projects.id, id)
		});
		return project ?? null;
	}

	async getByGithubRepo(githubRepo: string): Promise<Project[]> {
		return await db.query.projects.findMany({
			where: eq(projects.githubRepo, githubRepo)
		});
	}

	async create(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
		const [newProject] = await db
			.insert(projects)
			.values({
				...project,
				id: crypto.randomUUID()
			})
			.returning();
		return newProject;
	}

	async update(id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project> {
		const [updated] = await db
			.update(projects)
			.set(data)
			.where(eq(projects.id, id))
			.returning();
		return updated;
	}

	async delete(id: string): Promise<void> {
		await db.delete(projects).where(eq(projects.id, id));
	}

	async getByUserId(userId: string): Promise<Project[]> {
		return await db.query.projects.findMany({
			where: eq(projects.userId, userId)
		});
	}

	async findByAccess(options: FindByAccessOptions): Promise<Project[]> {
		const { userId, teamIds } = options;

		// Build OR conditions for direct access:
		// 1. Personal projects (userId matches)
		// 2. Team projects (teamId in user's teamIds)
		const conditions = [eq(projects.userId, userId)];
		if (teamIds.length > 0) {
			conditions.push(inArray(projects.teamId, teamIds));
		}

		// Get project IDs with direct access
		const directAccessProjects = await db.query.projects.findMany({
			where: (projects, { or }) => or(...conditions)
		});
		const directAccessIds = new Set(directAccessProjects.map((p) => p.id));

		// Get shared project IDs via subquery on project_members (no relations loaded)
		const sharedMemberRows = await db
			.select({ projectId: projectMembers.projectId })
			.from(projectMembers)
			.where(eq(projectMembers.userId, userId));

		const sharedProjectIds = new Set(sharedMemberRows.map(r => r.projectId));

		// Fetch only the shared projects not already included
		const idsToFetch = [...sharedProjectIds].filter(id => !directAccessIds.has(id));
		let sharedAccessProjects: Project[] = [];
		if (idsToFetch.length > 0) {
			sharedAccessProjects = await db.query.projects.findMany({
				where: inArray(projects.id, idsToFetch)
			});
		}

		return [...directAccessProjects, ...sharedAccessProjects];
	}
}
