import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import { stringifyEnv } from '$lib/utils/env-parser';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

const writeEnvSchema = z.object({
	targetPath: z.string().min(1),
	envVars: z.record(z.string(), z.string()),
	envSubdir: z.string().optional(),
});

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);
	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const repositoryId = Number(params.repositoryId);
	if (isNaN(repositoryId) || repositoryId <= 0) {
		return json({ error: 'Invalid repository ID' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validationResult = writeEnvSchema.safeParse(body);
	if (!validationResult.success) {
		const issues = validationResult.error.issues;
		const message = issues.length > 0 ? issues[0].message : 'Validation failed';
		return json({ error: message }, { status: 400 });
	}

	const { targetPath, envVars, envSubdir } = validationResult.data;

	// Validate targetPath is absolute
	if (!targetPath.startsWith('/')) {
		return json(
			{ error: 'Target path must be an absolute path' },
			{ status: 400 }
		);
	}

	// Validate directory exists
	if (!existsSync(targetPath)) {
		return json(
			{ error: 'Target directory does not exist' },
			{ status: 400 }
		);
	}

	try {
		const envContent = stringifyEnv(envVars as Record<string, string>);
		const envDir = envSubdir ? join(targetPath, envSubdir) : targetPath;
		const envPath = join(envDir, '.env');

		// Ensure the target directory exists
		if (!existsSync(envDir)) {
			return json(
				{ error: `Directory does not exist: ${envDir}` },
				{ status: 400 }
			);
		}

		writeFileSync(envPath, envContent + '\n', 'utf-8');

		logger.info('Environment file written during import', {
			userId: session.user.id,
			repositoryId,
			targetPath,
			envSubdir: envSubdir || '(root)',
			varCount: Object.keys(envVars).length,
		});

		return json({
			success: true,
			varCount: Object.keys(envVars).length,
			envPath,
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to write env file during import', {
			userId: session.user.id,
			repositoryId,
			targetPath,
			errorMessage,
		});
		return json({ error: `Failed to write .env file: ${errorMessage}` }, { status: 500 });
	}
};
