import type { projects } from '../db/schema';

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export interface IProjectRepository {
	getAll(): Promise<Project[]>;
	getById(id: string): Promise<Project | null>;
	create(project: Omit<NewProject, 'id' | 'createdAt'>): Promise<Project>;
	update(id: string, data: Partial<Omit<NewProject, 'id' | 'createdAt'>>): Promise<Project>;
	delete(id: string): Promise<void>;
	getByUserId(userId: string): Promise<Project[]>;
}
