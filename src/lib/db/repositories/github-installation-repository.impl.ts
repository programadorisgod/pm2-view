import { db } from '$lib/db/db';
import { githubInstallations, githubUserInstallations } from '../schema';
import { eq, inArray } from 'drizzle-orm';
import type { IGitHubInstallationRepository, GitHubInstallationRecord } from '$lib/github/github.types';

export class GitHubInstallationRepository implements IGitHubInstallationRepository {
	/**
	 * Get installation for a user. Checks the junction table first for org installations,
	 * then falls back to the old userId field for backward compatibility with personal installations.
	 */
	async getByUserId(userId: string): Promise<GitHubInstallationRecord | null> {
		// First check junction table (org installations shared by multiple users)
		const userInstallations = await db.query.githubUserInstallations.findFirst({
			where: eq(githubUserInstallations.userId, userId)
		});

		if (userInstallations) {
			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.installationId, userInstallations.installationId)
			});
			if (installation) return installation;
		}

		// Fallback: check the old userId field (for personal installations created before this change)
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
		userId?: string | null;
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
				userId: data.userId ?? null,
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
		// Delete junction table entries first (cascade should handle this, but be explicit)
		await db.delete(githubUserInstallations).where(eq(githubUserInstallations.installationId, installationId));
		await db.delete(githubInstallations).where(eq(githubInstallations.installationId, installationId));
	}

	// New methods for org-level installations

	async getInstallationIdsForUser(userId: string): Promise<number[]> {
		const records = await db.query.githubUserInstallations.findMany({
			where: eq(githubUserInstallations.userId, userId)
		});
		return records.map((r) => r.installationId);
	}

	async addUserToInstallation(userId: string, installationId: number): Promise<void> {
		// Check if already exists
		const existing = await db.query.githubUserInstallations.findFirst({
			where: eq(githubUserInstallations.userId, userId)
		});
		if (existing && existing.installationId === installationId) {
			return; // Already has access
		}
		await db.insert(githubUserInstallations).values({
			id: crypto.randomUUID(),
			userId,
			installationId,
			createdAt: new Date()
		});
	}

	async removeUserFromInstallation(userId: string, installationId: number): Promise<void> {
		await db
			.delete(githubUserInstallations)
			.where(eq(githubUserInstallations.userId, userId));
	}

	async userHasAccess(userId: string, installationId: number): Promise<boolean> {
		const record = await db.query.githubUserInstallations.findFirst({
			where: eq(githubUserInstallations.userId, userId)
		});
		return record !== undefined && record.installationId === installationId;
	}
}
