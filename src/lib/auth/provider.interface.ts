export interface AuthSession {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: Date;
  role: string;
  banned: boolean;
  banReason: string | null;
}

export interface AuthProvider {
  readonly name: string;
  login(email: string, password: string): Promise<AuthSession>;
  signup(email: string, password: string, name?: string): Promise<AuthSession>;
  logout(headers: Headers): Promise<void>;
  getSession(headers: Headers): Promise<AuthSession | null>;
}
