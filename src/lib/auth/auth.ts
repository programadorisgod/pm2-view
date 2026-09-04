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
import { google } from 'better-auth/social-providers';
import { sendNotificationEmail } from '../notifications';

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
				enabled: true,
				sendResetPassword: async ({ user, url }) => {
					const sent = await sendNotificationEmail({
						from: env.SMTP_FROM_EMAIL,
						to: user.email,
						subject: 'Reset your password',
						text: `Reset your PM2 View password by opening this link: ${url}`,
						html: `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#0A0A0A;font-family:Arial,sans-serif;">
	<div style="max-width:480px;margin:0 auto;background:#111111;border:1px solid #222222;border-radius:12px;padding:32px;">
		<h1 style="color:#0070F3;font-size:20px;margin:0 0 16px;">Reset your password</h1>
		<p style="color:#888888;font-size:14px;line-height:1.6;margin:0 0 24px;">We received a request to reset the password for your PM2 View account. Click the button below to choose a new password. This link expires in 1 hour.</p>
		<a href="${url}" style="display:inline-block;background:#0070F3;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px;">Reset password</a>
		<p style="color:#666666;font-size:12px;line-height:1.6;margin:24px 0 0;">If you didn't request this, you can safely ignore this email. Or open this link: <a href="${url}" style="color:#0070F3;">${url}</a></p>
	</div>
</body>
</html>`
					});
					if (!sent) {
						console.log(`[auth] Password reset link for ${user.email}: ${url}`);
					}
				},
				resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
				revokeSessionsOnPasswordReset: true
			},
			socialProviders: {
				google: {
					clientId: env.GOOGLE_CLIENT_ID,
					clientSecret: env.GOOGLE_CLIENT_SECRET
				}
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
