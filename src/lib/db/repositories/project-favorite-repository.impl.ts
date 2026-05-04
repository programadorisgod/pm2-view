import { db } from '../db';
import { projectFavorites } from '../schema';
import { eq, and } from 'drizzle-orm';
import type { ProjectFavorite, NewProjectFavorite } from '../schema/project-favorites';

export interface IProjectFavoriteRepository {
	getUserFavorites(userId: string): Promise<string[]>;
	isFavorite(userId: string, pm2Name: string): Promise<boolean>;
	add(userId: string, pm2Name: string): Promise<ProjectFavorite>;
	remove(userId: string, pm2Name: string): Promise<void>;
	toggle(userId: string, pm2Name: string): Promise<boolean>;
}

export class ProjectFavoriteRepository implements IProjectFavoriteRepository {
	async getUserFavorites(userId: string): Promise<string[]> {
		const favorites = await db.query.projectFavorites.findMany({
			where: eq(projectFavorites.userId, userId),
			columns: { pm2Name: true }
		});
		return favorites.map(f => f.pm2Name);
	}

	async isFavorite(userId: string, pm2Name: string): Promise<boolean> {
		const fav = await db.query.projectFavorites.findFirst({
			where: and(
				eq(projectFavorites.userId, userId),
				eq(projectFavorites.pm2Name, pm2Name)
			)
		});
		return !!fav;
	}

	async add(userId: string, pm2Name: string): Promise<ProjectFavorite> {
		const [fav] = await db
			.insert(projectFavorites)
			.values({
				id: crypto.randomUUID(),
				userId,
				pm2Name
			})
			.returning();
		return fav;
	}

	async remove(userId: string, pm2Name: string): Promise<void> {
		await db
			.delete(projectFavorites)
			.where(and(
				eq(projectFavorites.userId, userId),
				eq(projectFavorites.pm2Name, pm2Name)
			));
	}

	async toggle(userId: string, pm2Name: string): Promise<boolean> {
		const isFav = await this.isFavorite(userId, pm2Name);
		if (isFav) {
			await this.remove(userId, pm2Name);
			return false;
		} else {
			await this.add(userId, pm2Name);
			return true;
		}
	}
}
