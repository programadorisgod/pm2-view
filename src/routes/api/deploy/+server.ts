import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '$lib/auth';
import { getProjectRole } from '$lib/server/project-access';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { DeployService } from '$lib/deploy/deploy.service';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { EnvVarRepository } from '$lib/db/repositories/env-var-repository.impl';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import type { DeployStep, DeployOptions } from '$lib/deploy/deploy.types';

const deploySchema = z.object({
	pm_id: z.string().min(1, 'Process ID is required'),
	projectId: z.string().optional(),
	restartCommandIds: z.array(z.string()).optional(),
	startCommandIds: z.array(z.string()).optional(),
	installCommand: z.string().optional(),
	buildCommand: z.string().optional(),
	skipInstall: z.boolean().optional(),
});

function getZodErrorMessage(result: any): string {
	if (result.success) return '';
	const firstError = result.error?.issues?.[0] || result.issues?.[0];
	return firstError?.message || 'Validation failed';
}

/** In-memory lock to prevent concurrent deploys for the same process */
const activeDeploys = new Set<string>();

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);

	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } },
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

	const body = await request.json();
	const validationResult = deploySchema.safeParse(body);

	if (!validationResult.success) {
		return json({ error: getZodErrorMessage(validationResult) }, { status: 400 });
	}

	const { pm_id, projectId, restartCommandIds, startCommandIds, installCommand, buildCommand, skipInstall } = validationResult.data;

	// Resolve project ID
	let resolvedProjectId = projectId;
	if (!resolvedProjectId) {
		const pm2Repo = new PM2Repository();
		const proc = await pm2Repo.describe(pm_id);
		if (proc) {
			const projectRepo = new ProjectRepository();
			const allProjects = await projectRepo.getAll();
			const match = allProjects.find((p) => {
				if (p.pm2Name === proc.name) return true;
				if (p.pm2Names) {
					try {
						return (JSON.parse(p.pm2Names) as string[]).includes(proc.name);
					} catch {
						return false;
					}
				}
				return false;
			});
			if (match) resolvedProjectId = match.id;
		}
	}

	// Verify permissions
	if (user.role !== 'admin') {
		if (!resolvedProjectId) {
			return json({ error: 'Admin role required to deploy unregistered processes' }, { status: 403 });
		}
		const role = await getProjectRole(user.id, resolvedProjectId, user.role);
		if (!role || (role !== 'owner' && role !== 'editor')) {
			return json({ error: 'Forbidden: editor or owner permission required' }, { status: 403 });
		}
	}

	// Only admins can supply ad-hoc raw install/build command strings
	const isCustomCommandAllowed = user.role === 'admin';
	const safeInstallCommand = isCustomCommandAllowed ? installCommand : undefined;
	const safeBuildCommand = isCustomCommandAllowed ? buildCommand : undefined;

	// Resolve restart command IDs to actual commands
	let resolvedRestartCommands: string[] | undefined;
	if (restartCommandIds && restartCommandIds.length > 0 && resolvedProjectId) {
		const deployConfigRepo = new DeployConfigRepository();
		const commands = await deployConfigRepo.getByProjectId(resolvedProjectId);
		const selectedCommands = commands.filter((c) => restartCommandIds.includes(c.id));
		if (selectedCommands.length !== restartCommandIds.length) {
			activeDeploys.delete(pm_id);
			return json({ error: 'One or more restart command IDs are invalid' }, { status: 400 });
		}
		resolvedRestartCommands = selectedCommands
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((c) => c.command);
	}


	// Resolve start command IDs to actual commands
	let resolvedStartCommands: string[] | undefined;
	if (startCommandIds && startCommandIds.length > 0 && resolvedProjectId) {
		const deployConfigRepo = new DeployConfigRepository();
		const commands = await deployConfigRepo.getByProjectId(resolvedProjectId);
		const selectedCommands = commands.filter((c) => startCommandIds.includes(c.id));
		if (selectedCommands.length !== startCommandIds.length) {
			activeDeploys.delete(pm_id);
			return json({ error: 'One or more start command IDs are invalid' }, { status: 400 });
		}
		resolvedStartCommands = selectedCommands
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((c) => c.command);
	}

	let deployOptions: DeployOptions | undefined =
		safeInstallCommand || safeBuildCommand || resolvedRestartCommands || resolvedStartCommands || skipInstall !== undefined
			? {
					installCommand: safeInstallCommand,
					buildCommand: safeBuildCommand,
					restartCommands: resolvedRestartCommands,
					startCommands: resolvedStartCommands,
					skipInstall,
				}
			: undefined;

	// Load DB-managed env vars for the project (fail open — non-critical)
	let managedEnv: Record<string, string> | undefined;
	if (resolvedProjectId) {
		try {
			const envVarRepo = new EnvVarRepository();
			const vars = await envVarRepo.getByProjectId(resolvedProjectId);
			if (vars.length > 0) {
				managedEnv = Object.fromEntries(vars.map((v) => [v.key, v.value]));
			}
		} catch (err) {
			logger.error('Failed to load managed env vars for deploy', { projectId, error: err });
		}
	}

	if (managedEnv) {
		deployOptions = deployOptions ? { ...deployOptions, env: managedEnv } : { env: managedEnv };
	}

	// Check if a deploy is already running for this process
	if (activeDeploys.has(pm_id)) {
		return json({ error: 'A deploy is already in progress for this process' }, { status: 409 });
	}

	activeDeploys.add(pm_id);

	const encoder = new TextEncoder();
	const pm2Repo = new PM2Repository();
	const deployService = new DeployService(pm2Repo);

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;
			const safeEnqueue = (data: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(data + '\n'));
				} catch {
					// Stream already closed, ignore
				}
			};

			try {
				const result = await deployService.deploy(pm_id, (step: DeployStep, line: string, isError: boolean) => {
					safeEnqueue(JSON.stringify({ step, line, isError, isComplete: false }));
				}, deployOptions);

				if (result.needsApproval) {
					safeEnqueue(JSON.stringify({
						step: 'install',
						line: result.error || 'Approval needed for native builds',
						isError: false,
						isComplete: true,
						needsApproval: true,
						pendingPackages: result.pendingPackages ?? [],
					}));
				} else if (result.success) {
					safeEnqueue(JSON.stringify({
						step: 'complete',
						line: 'Deploy completed successfully',
						isError: false,
						isComplete: true,
						success: true,
					}));
				} else {
					safeEnqueue(JSON.stringify({
						step: 'complete',
						line: `Deploy failed: ${result.error}`,
						isError: true,
						isComplete: true,
						success: false,
					}));
				}
			} catch (err) {
				safeEnqueue(JSON.stringify({
					step: 'complete',
					line: `Deploy error: ${err instanceof Error ? err.message : 'Unknown error'}`,
					isError: true,
					isComplete: true,
					success: false,
				}));
			} finally {
				closed = true;
				activeDeploys.delete(pm_id);
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
