import type { Project } from '$lib/projects/project.types';
import type { IDeploymentRepository } from './deployment.types';
import type { DeploymentRunner } from './deployment-runner';
import { logger } from '$lib/logger';

export interface DeploymentWorkerDeps {
	deploymentRepo: IDeploymentRepository;
	projectRepo: { getById(id: string): Promise<Project | null> };
	runner: DeploymentRunner;
}

/**
 * In-process, DB-backed deployment queue.
 *
 * - The `deployments` table is the queue (`pending` = queued).
 * - Jobs are processed strictly one at a time (FIFO by createdAt),
 *   which guarantees no concurrent deployments for the same project.
 * - If a project already has a running deployment, its pending jobs are
 *   skipped in favor of other projects' jobs and retried afterwards.
 * - On first use after a server restart, stale `running` rows are marked
 *   failed and leftover `pending` jobs are resumed.
 *
 * The domain only depends on this class's `enqueue`/`kick` methods, so the
 * implementation can later be swapped for Redis/BullMQ without touching
 * services or handlers.
 */
export class DeploymentWorker {
	private processing = false;
	private recovered = false;

	constructor(private deps: DeploymentWorkerDeps) {}

	/**
	 * Registers a persisted deployment for execution.
	 * Fire-and-forget: never blocks the HTTP response.
	 */
	enqueue(deploymentId: string): void {
		this.kick().catch((err) => {
			logger.error('Deployment worker crashed', { error: err });
		});
	}

	/**
	 * Processes queued jobs until none are left. Safe to call concurrently:
	 * while a loop is active, additional calls are no-ops (the running loop
	 * picks up newly enqueued jobs before exiting).
	 */
	async kick(): Promise<void> {
		if (this.processing) return;
		this.processing = true;
		try {
			await this.ensureRecovered();
			const skipped: string[] = [];
			for (;;) {
				const job = await this.deps.deploymentRepo.findNextPending(skipped);
				if (!job) break;

				const busy = await this.deps.deploymentRepo.hasRunningForProject(
					job.projectId,
					job.id
				);
				if (busy) {
					logger.info('Deployment deferred: project already has a running deployment', {
						deploymentId: job.id,
						projectId: job.projectId
					});
					skipped.push(job.id);
					continue;
				}

				await this.processJob(job.id);
			}
		} finally {
			this.processing = false;
		}
	}

	private async processJob(deploymentId: string): Promise<void> {
		const deployment = await this.deps.deploymentRepo.getById(deploymentId);
		if (!deployment || deployment.status !== 'pending') return;

		const project = await this.deps.projectRepo.getById(deployment.projectId);
		if (!project) {
			logger.error('Deployment skipped: project not found', { deploymentId });
			await this.deps.deploymentRepo.markFailed(
				deploymentId,
				'worker',
				'Project not found',
				new Date(),
				0
			);
			return;
		}

		logger.info('Processing deployment', {
			deploymentId,
			project: project.name,
			repository: deployment.repository,
			branch: deployment.branch
		});

		try {
			await this.deps.runner.run(deployment, project);
		} catch (err) {
			// Runner handles its own failures; this guards against bugs escaping it.
			logger.error('Deployment runner threw unexpectedly', { deploymentId, error: err });
			const row = await this.deps.deploymentRepo.getById(deploymentId);
			if (row && row.status === 'running') {
				await this.deps.deploymentRepo.markFailed(
					deploymentId,
					'worker',
					err instanceof Error ? err.message : 'Unexpected worker error',
					new Date(),
					0
				);
			}
		}
	}

	private async ensureRecovered(): Promise<void> {
		if (this.recovered) return;
		this.recovered = true;
		try {
			const stale = await this.deps.deploymentRepo.failStaleRunning();
			if (stale > 0) {
				logger.warn('Marked stale running deployments as failed after restart', { count: stale });
			}
		} catch (err) {
			logger.error('Deployment recovery failed', { error: err });
		}
	}
}
