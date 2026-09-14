import { error } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { db } from '$lib/db';
import {
	users,
	sessions,
	accounts,
	projectMembers,
	teamMembers,
	projectFavorites,
	githubInstallations,
	githubUserInstallations,
	projects,
	deployCommands,
	deployments,
	envVars
} from '../schema';
import { eq, count, or } from 'drizzle-orm';
import type { IAuthRepository, User, Session } from '../../auth/auth.types';

/**
 * Better Auth implementation of IAuthRepository
 * Uses Better Auth API for user management operations
 * Uses Drizzle ORM for session operations (Better Auth doesn't expose session CRUD via API)
 *
 * Note: Better Auth auth.api.* methods have incorrect TypeScript types.
 * They're typed as returning Response but actually return parsed objects.
 * We use type assertions to work around this type mismatch.
 */
export class BetterAuthUserRepository implements IAuthRepository {
	async createSession(userId: string, expiresAt: Date, token: string): Promise<Session> {
		const [session] = await db
			.insert(sessions)
			.values({
				id: crypto.randomUUID(),
				userId,
				token,
				expiresAt
			})
			.returning();

		const user = await db.query.users.findFirst({
			where: eq(users.id, userId)
		});

		return this.mapToAuthSession(session, user);
	}

	async getSession(sessionId: string): Promise<Session | null> {
		const session = await db.query.sessions.findFirst({
			where: eq(sessions.id, sessionId)
		});

		if (!session) return null;

		const user = await db.query.users.findFirst({
			where: eq(users.id, session.userId)
		});

		return this.mapToAuthSession(session, user);
	}

	async deleteSession(sessionId: string): Promise<void> {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
	}

	async getUserByEmail(email: string): Promise<User | null> {
		const user = await db.query.users.findFirst({
			where: eq(users.email, email)
		});

		if (!user) return null;
		return this.mapToAuthUser(user);
	}

	async createUser(user: Omit<User, 'id' | 'createdAt'> & { password?: string }): Promise<User> {
		const existing = await this.getUserByEmail(user.email);
		if (existing) {
			throw error(409, 'A user with this email already exists');
		}

		try {
			// Better Auth createUser expects password in the body
			const result = await (auth.api as any).createUser({
				body: {
					email: user.email,
					name: user.name ?? undefined,
					role: user.role ?? 'user',
					password: user.password || ('temp-' + crypto.randomUUID()) // Better Auth requires password
				}
			});

			const createdUser = result?.user || result?.data?.user || (result?.id ? result : null);

			if (!createdUser) {
				const errorMsg = result?.error?.message || result?.message || 'Failed to create user via Better Auth API';
				throw error(400, errorMsg);
			}

			return this.mapBetterAuthUser(createdUser);
		} catch (err: any) {
			if (err && typeof err === 'object' && 'status' in err && typeof err.status === 'number') {
				throw err;
			}
			const statusCode = err?.statusCode || (typeof err?.status === 'number' ? err.status : 400);
			const message = err?.body?.message || err?.message || 'Failed to create user';
			throw error(statusCode >= 400 && statusCode < 600 ? statusCode : 400, message);
		}
	}

	async listUsers(options: { limit: number; offset: number; role?: string }): Promise<{ users: User[]; total: number }> {
		const whereClause = options.role ? eq(users.role, options.role) : undefined;

		const query = db.select().from(users);
		const userRecords = whereClause ? await query.where(whereClause) : await query;
		const mappedUsers = userRecords.map(u => this.mapToAuthUser(u));

		const countBase = db.select({ count: count() }).from(users);
		const [{ count: total }] = whereClause ? await countBase.where(whereClause) : await countBase;

		// Paginate
		const paginated = mappedUsers.slice(options.offset, options.offset + options.limit);

		return {
			users: paginated,
			total: Number(total)
		};
	}

	async getUserById(userId: string): Promise<User | null> {
		const user = await db.query.users.findFirst({
			where: eq(users.id, userId)
		});

		if (!user) return null;
		return this.mapToAuthUser(user);
	}

	async setRole(userId: string, role: string): Promise<void> {
		await db.update(users)
			.set({ role, updatedAt: new Date() })
			.where(eq(users.id, userId));
	}

	async banUser(userId: string, reason?: string): Promise<void> {
		await db.update(users)
			.set({ banned: true, banReason: reason ?? 'Banned by administrator', updatedAt: new Date() })
			.where(eq(users.id, userId));
	}

	async unbanUser(userId: string): Promise<void> {
		await db.update(users)
			.set({ banned: false, banReason: null, updatedAt: new Date() })
			.where(eq(users.id, userId));
	}

	async deleteUser(userId: string): Promise<void> {
		try {
			// 1. Find all projects owned by this user and clean up their child records
			const userProjects = await db
				.select({ id: projects.id })
				.from(projects)
				.where(eq(projects.userId, userId));

			if (Array.isArray(userProjects) && userProjects.length > 0) {
				for (const p of userProjects) {
					await db.delete(deployCommands).where(eq(deployCommands.projectId, p.id));
					await db.delete(deployments).where(eq(deployments.projectId, p.id));
					await db.delete(envVars).where(eq(envVars.projectId, p.id));
					await db.delete(projectMembers).where(eq(projectMembers.projectId, p.id));
				}
				await db.delete(projects).where(eq(projects.userId, userId));
			}

			// 2. Clean up all user relations and junction records across all projects/teams
			await db.delete(projectMembers).where(eq(projectMembers.userId, userId));
			await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
			await db.delete(projectFavorites).where(eq(projectFavorites.userId, userId));
			await db.delete(githubUserInstallations).where(eq(githubUserInstallations.userId, userId));
			await db.delete(githubInstallations).where(eq(githubInstallations.userId, userId));
			await db.delete(sessions).where(or(eq(sessions.userId, userId), eq(sessions.impersonatedBy, userId)));
			await db.delete(accounts).where(eq(accounts.userId, userId));

			// 3. Finally delete the user record
			await db.delete(users).where(eq(users.id, userId));
		} catch (err: any) {
			console.error('Failed to delete user in repository:', err);
			throw err;
		}
	}

	private mapToAuthUser(user: typeof users.$inferSelect): User {
		return {
			id: user.id,
			email: user.email,
			name: user.name,
			emailVerified: user.emailVerified ?? false,
			createdAt: user.createdAt,
			role: (user as Record<string, unknown>).role as string ?? 'user',
			banned: Boolean((user as Record<string, unknown>).banned) ?? false,
			banReason: (user as Record<string, unknown>).banReason as string | null ?? null
		};
	}

	private mapToAuthSession(
		session: typeof sessions.$inferSelect,
		user: typeof users.$inferSelect | undefined
	): Session {
		return {
			user: user ? this.mapToAuthUser(user) : {
				id: session.userId,
				email: '',
				name: null,
				emailVerified: false,
				createdAt: new Date(),
				role: 'user',
				banned: false,
				banReason: null
			},
			token: session.token,
			expiresAt: session.expiresAt
		};
	}

	private mapBetterAuthUser(user: Record<string, unknown>): User {
		return {
			id: user.id as string,
			email: user.email as string,
			name: user.name as string | null,
			emailVerified: Boolean(user.emailVerified ?? false),
			createdAt: user.createdAt as Date ?? new Date(),
			role: (user.role as string) ?? 'user',
			banned: Boolean(user.banned ?? false),
			banReason: (user.banReason as string | null) ?? null
		};
	}
}

/**
 * Factory function to create BetterAuthUserRepository
 * Uses default auth and db imports
 */
export function createBetterAuthUserRepository(): BetterAuthUserRepository {
	return new BetterAuthUserRepository();
}
