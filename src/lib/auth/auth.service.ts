import { auth } from './auth';
import type { User } from './auth.types';

export interface LoginResult {
	user: User;
	token: string;
	redirect: boolean;
	url?: string;
}

export interface SessionResult {
	user: User | null;
	session: {
		token: string;
		userId: string;
		expiresAt: Date;
	} | null;
}

export const authService = {
	async login(email: string, password: string): Promise<LoginResult> {
		const result = await auth.api.signInEmail({
			body: {
				email,
				password
			}
		}) as unknown as { user: User; token: string; redirect: boolean; url?: string };

		return {
			user: result.user,
			token: result.token || '',
			redirect: result.redirect || false,
			url: result.url
		};
	},

	async signup(email: string, password: string, name?: string): Promise<LoginResult> {
		const body: Record<string, string> = {
			email,
			password
		};
		if (name) body.name = name;

		const result = await auth.api.signUpEmail({
			body: body as any
		}) as unknown as { user: User; token: string; redirect: boolean; url?: string };

		return {
			user: result.user,
			token: result.token || '',
			redirect: result.redirect || false,
			url: result.url
		};
	},

	async logout(): Promise<void> {
		await auth.api.signOut();
	},

	async getSession(): Promise<SessionResult> {
		const result = await auth.api.getSession({
			headers: new Headers()
		}) as unknown as { user: User | null; session: SessionResult['session'] };

		return {
			user: result?.user ?? null,
			session: result?.session ?? null
		};
	},

	async getUser(): Promise<User | null> {
		const result = await this.getSession();
		return result.user;
	}
};
