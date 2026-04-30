import { auth } from '$lib/auth';
import { db } from '../db';
import { users, sessions } from '../schema';
import { eq } from 'drizzle-orm';
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

	async createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
		// Better Auth createUser expects password in the body
		const result = await (auth.api as any).createUser({
			body: {
				email: user.email,
				name: user.name ?? undefined,
				role: user.role ?? 'user',
				password: 'temp-password-' + crypto.randomUUID() // Better Auth requires password
			}
		});

		if (!result || !result.data?.user) {
			throw new Error('Failed to create user via Better Auth API');
		}

		return this.mapBetterAuthUser(result.data.user);
	}

	async listUsers(options: { limit: number; offset: number; role?: string }): Promise<{ users: User[]; total: number }> {
		const result = await (auth.api as any).listUsers({
			query: {
				limit: options.limit,
				offset: options.offset,
				...(options.role && { role: options.role })
			}
		});

		if (!result || !result.data) {
			throw new Error('Failed to list users via Better Auth API');
		}

		const users = (result.data.users || []).map((u: Record<string, unknown>) => this.mapBetterAuthUser(u));
		return {
			users,
			total: result.data.total ?? users.length
		};
	}

	async getUserById(userId: string): Promise<User | null> {
		const result = await (auth.api as any).getUser({
			body: { userId }
		});

		if (!result || !result.data?.user) {
			return null;
		}

		return this.mapBetterAuthUser(result.data.user);
	}

	async setRole(userId: string, role: string): Promise<void> {
		const result = await (auth.api as any).setRole({
			body: { userId, role }
		});

		if (result?.error) {
			throw new Error(`Failed to set role: ${result.error.message}`);
		}
	}

	async banUser(userId: string, reason?: string): Promise<void> {
		const result = await (auth.api as any).banUser({
			body: {
				userId,
				banReason: reason ?? 'Banned by administrator'
			}
		});

		if (result?.error) {
			throw new Error(`Failed to ban user: ${result.error.message}`);
		}
	}

	async unbanUser(userId: string): Promise<void> {
		const result = await (auth.api as any).unbanUser({
			body: { userId }
		});

		if (result?.error) {
			throw new Error(`Failed to unban user: ${result.error.message}`);
		}
	}

	async deleteUser(userId: string): Promise<void> {
		const result = await (auth.api as any).deleteUser({
			body: { userId }
		});

		if (result?.error) {
			throw new Error(`Failed to delete user: ${result.error.message}`);
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
