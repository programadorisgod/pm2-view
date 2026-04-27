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
		return session;
	}

	async getSession(sessionId: string): Promise<Session | null> {
		const session = await db.query.sessions.findFirst({
			where: eq(sessions.id, sessionId)
		});
		return session ?? null;
	}

	async deleteSession(sessionId: string): Promise<void> {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
	}

	async getUserByEmail(email: string): Promise<User | null> {
		const user = await db.query.users.findFirst({
			where: eq(users.email, email)
		});
		return user ?? null;
	}

	async createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
		const [newUser] = await db
			.insert(users)
			.values({
				...user,
				id: crypto.randomUUID()
			})
			.returning();
		return newUser;
	}
}
