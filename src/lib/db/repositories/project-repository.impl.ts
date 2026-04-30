import { db } from '../db';
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

		// Build OR conditions for three access paths:
		// 1. Personal projects (userId matches)
		// 2. Team projects (teamId in user's teamIds)
		// 3. Shared projects (project_members entry exists)
		const conditions = [eq(projects.userId, userId)];

		// Add team condition only if user has teams
		if (teamIds.length > 0) {
			conditions.push(inArray(projects.teamId, teamIds));
		}

		// Get projects matching personal or team access
		const directAccessProjects = await db.query.projects.findMany({
			where: (projects, { or }) => or(...conditions)
		});

		// Get project IDs from direct access to avoid duplicates
		const directAccessIds = new Set(directAccessProjects.map((p) => p.id));

		// Get shared projects (project_members)
		const sharedProjects = await db.query.projects.findMany({
			with: {
				projectMembers: {
					where: eq(projectMembers.userId, userId)
				}
			}
		});

		// Filter to only those where user is a member
		const sharedAccessProjects = sharedProjects.filter(
			(p) => p.projectMembers && p.projectMembers.length > 0 && !directAccessIds.has(p.id)
		);

		// Combine results (direct access + shared access not already included)
		const allProjects = [...directAccessProjects, ...sharedAccessProjects];

		// Remove projectMembers from returned projects for consistency
		return allProjects.map(({ projectMembers, ...project }) => project);
	}
}
