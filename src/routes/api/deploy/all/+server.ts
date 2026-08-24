import { json, type RequestHandler } from '@sveltejs/kit';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { DeployService } from '$lib/deploy/deploy.service';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { EnvVarRepository } from '$lib/db/repositories/env-var-repository.impl';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import type { DeployStep, DeployOptions } from '$lib/deploy/deploy.types';
import type { PM2Process } from '$lib/pm2/pm2.types';

/** In-memory lock to prevent concurrent multi-deploys */
let activeMultiDeploy = false;

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);

	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } },
		);
	}

	if (activeMultiDeploy) {
		return json({ error: 'A multi-app deploy is already in progress' }, { status: 409 });
	}

	activeMultiDeploy = true;

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
				// Get all online processes
				const processes = await pm2Repo.list();
				const onlineProcesses = (processes as PM2Process[]).filter(
					(p) => p.pm2_env.status === 'online',
				);

				if (onlineProcesses.length === 0) {
					safeEnqueue(JSON.stringify({
						type: 'complete',
						line: 'No online processes to deploy',
						isError: true,
						isComplete: true,
						success: false,
					}));
					return;
				}

				safeEnqueue(JSON.stringify({
					type: 'summary',
					total: onlineProcesses.length,
					processes: onlineProcesses.map((p) => ({
						pm_id: p.pm_id.toString(),
						name: p.name,
					})),
					isComplete: false,
				}));

				let allSuccess = true;
				const results: Array<{ pm_id: string; name: string; success: boolean }> = [];

				for (const proc of onlineProcesses) {
					const pmId = proc.pm_id.toString();

					safeEnqueue(JSON.stringify({
						type: 'process-start',
						pm_id: pmId,
						name: proc.name,
						isComplete: false,
					}));

					// Resolve deploy options for this process
					let deployOptions: DeployOptions | undefined;

					// Try to find a project with this pm2Name to get deploy config
					try {
						const deployConfigRepo = new DeployConfigRepository();
						// We need projectId - try to resolve via pm2Name
						// For now, deploy with defaults (no custom commands)
					} catch {
						// Non-critical - deploy with defaults
					}

					// Load managed env vars if there's a matching project
					try {
						const envVarRepo = new EnvVarRepository();
						// We'd need projectId here - skip for now, deploy uses .env files
					} catch {
						// Non-critical
					}

					const result = await deployService.deploy(pmId, (step: DeployStep, line: string, isError: boolean) => {
						safeEnqueue(JSON.stringify({
							type: 'log',
							pm_id: pmId,
							name: proc.name,
							step,
							line,
							isError,
							isComplete: false,
						}));
					}, deployOptions);

					if (result.needsApproval) {
						safeEnqueue(JSON.stringify({
							type: 'process-complete',
							pm_id: pmId,
							name: proc.name,
							success: false,
							needsApproval: true,
							pendingPackages: result.pendingPackages ?? [],
							line: result.error || 'Approval needed for native builds',
							isComplete: false,
						}));
						allSuccess = false;
						results.push({ pm_id: pmId, name: proc.name, success: false });
					} else if (result.success) {
						safeEnqueue(JSON.stringify({
							type: 'process-complete',
							pm_id: pmId,
							name: proc.name,
							success: true,
							line: 'Deploy completed successfully',
							isComplete: false,
						}));
						results.push({ pm_id: pmId, name: proc.name, success: true });
					} else {
						safeEnqueue(JSON.stringify({
							type: 'process-complete',
							pm_id: pmId,
							name: proc.name,
							success: false,
							line: `Deploy failed: ${result.error}`,
							isError: true,
							isComplete: false,
						}));
						allSuccess = false;
						results.push({ pm_id: pmId, name: proc.name, success: false });
					}
				}

				safeEnqueue(JSON.stringify({
					type: 'complete',
					line: allSuccess
						? `All ${onlineProcesses.length} apps deployed successfully`
						: `Deploy finished with errors — ${results.filter((r) => r.success).length}/${onlineProcesses.length} succeeded`,
					isError: !allSuccess,
					isComplete: true,
					success: allSuccess,
					results,
				}));
			} catch (err) {
				safeEnqueue(JSON.stringify({
					type: 'complete',
					line: `Multi-app deploy failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
					isError: true,
					isComplete: true,
					success: false,
				}));
			} finally {
				closed = true;
				activeMultiDeploy = false;
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
