import { db } from '../db';
import { users, sessions } from '../schema';
import { eq } from 'drizzle-orm';
import type { IAuthRepository, User, Session } from '../../auth/auth.types';

export class AuthRepository implements IAuthRepository {
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

		// Fetch the user to create a complete AuthSession
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

		// Fetch the user to create a complete AuthSession
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
		const [newUser] = await db
			.insert(users)
			.values({
				...user,
				id: crypto.randomUUID()
			})
			.returning();
		return this.mapToAuthUser(newUser);
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
}
