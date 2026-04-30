export type { AuthUser, AuthSession, AuthProvider } from './provider.interface';

// Keep backward-compatible aliases for existing code
export type User = import('./provider.interface').AuthUser;
export type Session = import('./provider.interface').AuthSession;

export interface IAuthRepository {
  createSession(userId: string, expiresAt: Date, token: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  deleteSession(sessionId: string): Promise<void>;
  getUserByEmail(email: string): Promise<User | null>;
  createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  listUsers(options: { limit: number; offset: number; role?: string }): Promise<{ users: User[]; total: number }>;
  getUserById(userId: string): Promise<User | null>;
  setRole(userId: string, role: string): Promise<void>;
  banUser(userId: string, reason?: string): Promise<void>;
  unbanUser(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}
