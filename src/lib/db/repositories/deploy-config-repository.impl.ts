import { db } from '$lib/db/db';
import { deployCommands } from '../schema';
import { eq, and, asc } from 'drizzle-orm';
import type { IDeployConfigRepository, DeployCommand, CommandType } from '$lib/deploy-config/deploy-config.types';

export class DeployConfigRepository implements IDeployConfigRepository {
	async getById(id: string): Promise<DeployCommand | null> {
		const command = await db.query.deployCommands.findFirst({
			where: eq(deployCommands.id, id)
		});
		return command ?? null;
	}

	async getByProjectId(projectId: string): Promise<DeployCommand[]> {
		const commands = await db.query.deployCommands.findMany({
			where: eq(deployCommands.projectId, projectId),
			orderBy: [asc(deployCommands.commandType), asc(deployCommands.sortOrder)]
		});
		return commands;
	}

	async getByType(projectId: string, commandType: CommandType): Promise<DeployCommand[]> {
		const commands = await db.query.deployCommands.findMany({
			where: and(
				eq(deployCommands.projectId, projectId),
				eq(deployCommands.commandType, commandType)
			),
			orderBy: asc(deployCommands.sortOrder)
		});
		return commands;
	}

	async create(cmd: Omit<DeployCommand, 'id' | 'createdAt'>): Promise<DeployCommand> {
		const [newCommand] = await db
			.insert(deployCommands)
			.values({
				...cmd,
				id: crypto.randomUUID()
			})
			.returning();
		return newCommand;
	}

	async update(id: string, data: Partial<Omit<DeployCommand, 'id' | 'createdAt'>>): Promise<DeployCommand> {
		const [updated] = await db
			.update(deployCommands)
			.set(data)
			.where(eq(deployCommands.id, id))
			.returning();
		return updated;
	}

	async delete(id: string): Promise<void> {
		await db.delete(deployCommands).where(eq(deployCommands.id, id));
	}

	async deleteAllForProject(projectId: string): Promise<void> {
		await db.delete(deployCommands).where(eq(deployCommands.projectId, projectId));
	}
}