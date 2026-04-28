import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from '../db/db';
import * as schema from '../db/schema';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL || 'http://localhost:5179',
	basePath: `${base}/api/auth`,
	database: drizzleAdapter(db, {
		provider: 'sqlite',
		schema: {
			...schema,
			user: schema.users,
			session: schema.sessions
		},
		usePlural: true
	}),
	plugins: [sveltekitCookies(getRequestEvent)],
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days in seconds
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5 // 5 minutes
		}
	},
	emailAndPassword: {
		enabled: true
	}
});
