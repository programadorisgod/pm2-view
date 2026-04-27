import { db } from '../db';
import { envVars } from '../schema';
import { eq } from 'drizzle-orm';
import type { IEnvVarRepository, EnvVar } from '../../env-vars/env-var.types';

export class EnvVarRepository implements IEnvVarRepository {
	async getByProjectId(projectId: string): Promise<EnvVar[]> {
		return await db.query.envVars.findMany({
			where: eq(envVars.projectId, projectId)
		});
	}

	async create(envVar: Omit<EnvVar, 'id'>): Promise<EnvVar> {
		const [newEnvVar] = await db
			.insert(envVars)
			.values({
				...envVar,
				id: crypto.randomUUID()
			})
			.returning();
		return newEnvVar;
	}

	async update(id: string, data: Partial<Omit<EnvVar, 'id'>>): Promise<EnvVar> {
		const [updated] = await db
			.update(envVars)
			.set(data)
			.where(eq(envVars.id, id))
			.returning();
		return updated;
	}

	async delete(id: string): Promise<void> {
		await db.delete(envVars).where(eq(envVars.id, id));
	}

	async bulkUpdate(projectId: string, envVarsList: Omit<EnvVar, 'id'>[]): Promise<EnvVar[]> {
		// Delete existing env vars for the project
		await db.delete(envVars).where(eq(envVars.projectId, projectId));

		// Insert new env vars
		const newEnvVars = envVarsList.map((envVar) => ({
			...envVar,
			id: crypto.randomUUID()
		}));

		return await db.insert(envVars).values(newEnvVars).returning();
	}
}
