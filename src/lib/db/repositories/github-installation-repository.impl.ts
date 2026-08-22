import { db } from '$lib/db/db';
import { githubInstallations } from '../schema';
import { eq } from 'drizzle-orm';
import type { IGitHubInstallationRepository, GitHubInstallationRecord } from '$lib/github/github.types';

export class GitHubInstallationRepository implements IGitHubInstallationRepository {
	async getByUserId(userId: string): Promise<GitHubInstallationRecord | null> {
		const installation = await db.query.githubInstallations.findFirst({
			where: eq(githubInstallations.userId, userId)
		});
		return installation ?? null;
	}

	async getByInstallationId(installationId: number): Promise<GitHubInstallationRecord | null> {
		const installation = await db.query.githubInstallations.findFirst({
			where: eq(githubInstallations.installationId, installationId)
		});
		return installation ?? null;
	}

	async getByAccountLogin(accountLogin: string): Promise<GitHubInstallationRecord | null> {
		const installation = await db.query.githubInstallations.findFirst({
			where: eq(githubInstallations.accountLogin, accountLogin)
		});
		return installation ?? null;
	}

	async create(data: {
		userId: string;
		installationId: number;
		accountLogin: string;
		accountType: string;
		accountAvatar?: string | null;
	}): Promise<GitHubInstallationRecord> {
		const now = new Date();
		const [newInstallation] = await db
			.insert(githubInstallations)
			.values({
				id: crypto.randomUUID(),
				userId: data.userId,
				installationId: data.installationId,
				accountLogin: data.accountLogin,
				accountType: data.accountType,
				accountAvatar: data.accountAvatar ?? null,
				createdAt: now,
				updatedAt: now
			})
			.returning();
		return newInstallation;
	}

	async update(
		installationId: number,
		data: Partial<Pick<GitHubInstallationRecord, 'accountLogin' | 'accountType' | 'accountAvatar'>>
	): Promise<GitHubInstallationRecord> {
		const [updated] = await db
			.update(githubInstallations)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(githubInstallations.installationId, installationId))
			.returning();
		return updated;
	}

	async delete(installationId: number): Promise<void> {
		await db.delete(githubInstallations).where(eq(githubInstallations.installationId, installationId));
	}
}
