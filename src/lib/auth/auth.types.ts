import type { users, sessions } from '../db/schema';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export interface IAuthRepository {
	createSession(userId: string, expiresAt: Date, token: string): Promise<Session>;
	getSession(sessionId: string): Promise<Session | null>;
	deleteSession(sessionId: string): Promise<void>;
	getUserByEmail(email: string): Promise<User | null>;
	createUser(user: Omit<NewUser, 'id' | 'createdAt'>): Promise<User>;
}
