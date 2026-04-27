import { db } from '../db';
import { projects } from '../schema';
import { eq } from 'drizzle-orm';
import type { IProjectRepository, Project } from '../../projects/project.types';

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
}
