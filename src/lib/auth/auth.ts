import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from '../db/db';
import * as schema from '../db/schema';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import { admin } from 'better-auth/plugins/admin';
import { createAccessControl } from 'better-auth/plugins/access';

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || 'localhost')
	.split(',')
	.map((h) => h.trim())
	.filter(Boolean);

const trustedOrigins = allowedHosts.map((host) =>
	host === 'localhost' ? 'http://localhost:5179' : `https://${host}`
);

const accessControlStatements = {
	user: ['create', 'read', 'list', 'set-role', 'ban', 'impersonate', 'impersonate-admins', 'delete', 'set-password', 'get', 'update'],
	project: ['create', 'read', 'update', 'delete'],
	project_member: ['create', 'read', 'update', 'delete'],
	team: ['create', 'read', 'update', 'delete'],
	team_member: ['create', 'read', 'update', 'delete'],
	audit_log: ['create', 'read', 'delete']
} as const;

const ac = createAccessControl(accessControlStatements);

const adminRole = ac.newRole({
	user: ['create', 'read', 'list', 'set-role', 'ban', 'impersonate', 'impersonate-admins', 'delete', 'set-password', 'get', 'update'],
	project: ['create', 'read', 'update', 'delete'],
	project_member: ['create', 'read', 'update', 'delete'],
	team: ['create', 'read', 'update', 'delete'],
	team_member: ['create', 'read', 'update', 'delete'],
	audit_log: ['create', 'read', 'delete']
});

const userRole = ac.newRole({
	user: ['create', 'read', 'list', 'get'],
	project: ['create', 'read', 'update'],
	project_member: ['create', 'read'],
	team: ['create', 'read'],
	team_member: ['create', 'read'],
	audit_log: []
});

const viewerRole = ac.newRole({
	user: ['read', 'list', 'get'],
	project: ['read'],
	project_member: ['read'],
	team: ['read'],
	team_member: ['read'],
	audit_log: []
});

let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
	if (!_auth) {
		_auth = betterAuth({
			baseURL: env.BETTER_AUTH_URL || 'http://localhost:5179',
			basePath: `${base}/api/auth`,
			trustedOrigins,
			database: drizzleAdapter(db, {
				provider: 'sqlite',
				schema: {
					...schema,
					user: schema.users,
					session: schema.sessions
				},
				usePlural: true
			}),
			plugins: [
				sveltekitCookies(getRequestEvent),
				admin({
					defaultRole: 'user',
					adminRoles: ['admin'],
					roles: {
						admin: adminRole,
						user: userRole,
						viewer: viewerRole
					},
					ac
				})
			],
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
	}
	return _auth;
}

// Re-export for convenience — lazy getter pattern
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
	get(_, prop) {
		return getAuth()[prop as keyof ReturnType<typeof betterAuth>];
	}
});
