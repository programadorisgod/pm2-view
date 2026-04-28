import type { AuthProvider, AuthSession, AuthUser } from '../provider.interface';
import { auth } from '../auth';

export class BetterAuthProvider implements AuthProvider {
  readonly name = 'better-auth';

  async login(email: string, password: string): Promise<AuthSession> {
    const result = await auth.api.signInEmail({
      body: {
        email,
        password
      },
      headers: new Headers()
    });
    return this.normalizeSession(result);
  }

  async signup(email: string, password: string, name?: string): Promise<AuthSession> {
    const body: {
      email: string;
      password: string;
      name: string;
    } = { email, password, name: name ?? '' };

    const result = await auth.api.signUpEmail({
      body,
      headers: new Headers()
    });
    return this.normalizeSession(result);
  }

  async logout(headers: Headers): Promise<void> {
    await auth.api.signOut({ headers });
  }

  async getSession(headers: Headers): Promise<AuthSession | null> {
    const result = await auth.api.getSession({ headers });
    if (!result?.user || !result?.session) return null;
    return this.normalizeSession(result);
  }

  private normalizeSession(raw: unknown): AuthSession {
    const result = raw as Record<string, unknown>;
    const user = result.user as Record<string, unknown>;
    const session = result.session as Record<string, unknown> | undefined;

    return {
      user: {
        id: user.id as string,
        email: user.email as string,
        name: (user.name as string) ?? null,
        emailVerified: Boolean(user.emailVerified),
        createdAt: new Date(user.createdAt as string)
      },
      token: (result.token ?? session?.token ?? '') as string,
      expiresAt: new Date((session?.expiresAt ?? user.expiresAt) as string)
    };
  }
}
