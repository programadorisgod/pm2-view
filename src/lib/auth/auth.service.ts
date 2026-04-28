import type { AuthProvider, AuthSession, AuthUser } from './provider.interface';
import { createAuthProvider } from './factory';

export interface LoginResult {
  user: AuthUser;
  token: string;
  redirect: boolean;
  url?: string;
}

export interface SessionResult {
  user: AuthUser | null;
  session: {
    token: string;
    userId: string;
    expiresAt: Date;
  } | null;
}

let provider: AuthProvider | null = null;

function getProvider(): AuthProvider {
  if (!provider) {
    provider = createAuthProvider();
  }
  return provider;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResult> {
    const session = await getProvider().login(email, password);
    return {
      user: session.user,
      token: session.token,
      redirect: false,
    };
  },

  async signup(email: string, password: string, name?: string): Promise<LoginResult> {
    const session = await getProvider().signup(email, password, name);
    return {
      user: session.user,
      token: session.token,
      redirect: false,
    };
  },

  async logout(headers: Headers): Promise<void> {
    await getProvider().logout(headers);
  },

  async getSession(headers: Headers): Promise<SessionResult> {
    const session = await getProvider().getSession(headers);
    if (!session) {
      return { user: null, session: null };
    }
    return {
      user: session.user,
      session: {
        token: session.token,
        userId: session.user.id,
        expiresAt: session.expiresAt,
      },
    };
  },

  async getUser(headers: Headers): Promise<AuthUser | null> {
    const result = await this.getSession(headers);
    return result.user;
  }
};
