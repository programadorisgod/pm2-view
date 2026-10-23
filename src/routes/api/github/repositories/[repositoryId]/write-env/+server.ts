import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import { stringifyEnv } from '$lib/utils/env-parser';
import { existsSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import { getEnv } from '$lib/db/env';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
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
	const user = session.user as any;
	if (user.banned) {
		return json({ error: 'Account is banned' }, { status: 403 });
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

	// Non-admin path confinement: targetPath must be within REPOS_PATH
	if (user.role !== 'admin') {
		const env = getEnv();
		const reposRoot = resolve(env.REPOS_PATH || '/opt/repos');
		const resolvedTarget = resolve(targetPath);
		if (resolvedTarget !== reposRoot && !resolvedTarget.startsWith(reposRoot + sep)) {
			return json({ error: `Forbidden: Non-admin users can only write inside ${reposRoot}` }, { status: 403 });
		}
	}

	// Verify user's installation owns the repository
	try {
		const installationRepo = new GitHubInstallationRepository();
		const appClient = new GitHubAppClient();

		const installation = await installationRepo.getByUserId(session.user.id);
		if (!installation) {
			return json({ error: 'GitHub not connected' }, { status: 404 });
		}

		const repos = await appClient.listInstallationRepositories(installation.installationId);
		const repo = repos.repositories.find((r) => r.id === repositoryId);
		if (!repo) {
			return json({ error: 'Repository not accessible' }, { status: 403 });
		}
	} catch (err: any) {
		const errorMessage = err?.message || String(err) || 'Unknown error';
		logger.error('Failed to verify GitHub repository access before writing env', {
			userId: session.user.id,
			repositoryId,
			errorMessage
		});
		return json({ error: `Verification failed: ${errorMessage}` }, { status: 500 });
	}

	// Validate directory exists
	if (!existsSync(targetPath)) {
		return json(
			{ error: 'Target directory does not exist' },
			{ status: 400 }
		);
	}

	try {
		const resolvedRoot = resolve(targetPath);
		const envDir = envSubdir ? resolve(resolvedRoot, envSubdir) : resolvedRoot;

		// Path traversal protection: envDir must be within targetPath
		if (envDir !== resolvedRoot && !envDir.startsWith(resolvedRoot + sep)) {
			return json({ error: 'Target directory must be inside the target path' }, { status: 400 });
		}

		const envContent = stringifyEnv(envVars as Record<string, string>);
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
