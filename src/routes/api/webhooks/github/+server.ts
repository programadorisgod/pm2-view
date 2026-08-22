import { json, type RequestHandler } from '@sveltejs/kit';
import { GitHubWebhookVerifier } from '$lib/github/infrastructure/github-webhook-verifier';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubSetupService } from '$lib/github/github-setup.service';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { logger } from '$lib/logger';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { DeploymentRepository } from '$lib/db/repositories/deployment-repository.impl';
import { getDeploymentWorker } from '$lib/deploy/factory';

const COMMIT_SHA_REGEX = /^[0-9a-f]{40}$/i;

let verifier: GitHubWebhookVerifier | null = null;

function getVerifier(): GitHubWebhookVerifier {
	if (!verifier) {
		verifier = new GitHubWebhookVerifier();
	}
	return verifier;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const headers: Record<string, string> = {};
	request.headers.forEach((value, key) => {
		headers[key] = value;
	});

	const webhooks = getVerifier();
	const result = await webhooks.verifyAndReceive(headers, body);

	if (!result.verified) {
		return json({ error: 'Invalid webhook signature' }, { status: 401 });
	}

	if (!result.event) {
		return new Response(null, { status: 204 });
	}

	const { name: eventName, payload } = result.event;
	logger.info('GitHub webhook received', {
		event: eventName,
		deliveryId: headers['x-github-delivery']
	});

	try {
		if (eventName === 'push') {
			return await handlePushEvent(payload, headers['x-github-delivery']);
		}
		await handleWebhookEvent(eventName, payload);
	} catch (err) {
		logger.error('Webhook handler error', { event: eventName, error: err });
	}

	return new Response(null, { status: 204 });
};

/**
 * Handles push events for auto-deployment.
 *
 * Security invariants:
 * - The signature was already verified (HMAC-SHA256 over the raw body).
 * - The repository/branch come from internal project configuration; the
 *   payload can only MATCH a configured project, never select an arbitrary one.
 * - The commit SHA is validated against the git SHA format before use.
 * - The delivery ID is unique per deployment (idempotency on retries).
 */
async function handlePushEvent(
	payload: Record<string, unknown>,
	deliveryId: string | undefined
): Promise<Response> {
	if (!deliveryId) {
		return new Response(null, { status: 400 });
	}

	const repository = payload.repository as { full_name?: string } | undefined;
	const ref = payload.ref;
	const after = payload.after;

	const repoFullName = typeof repository?.full_name === 'string' ? repository.full_name : null;
	const branch = typeof ref === 'string' && ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;

	if (!repoFullName || !branch || typeof after !== 'string' || !COMMIT_SHA_REGEX.test(after)) {
		logger.warn('Push webhook ignored: invalid or missing payload fields', { deliveryId, repoFullName, ref });
		return new Response(null, { status: 204 });
	}

	// Idempotency: same delivery must never create a second deployment
	const deploymentRepo = new DeploymentRepository();
	const existing = await deploymentRepo.getByDeliveryId(deliveryId);
	if (existing) {
		logger.info('Duplicate webhook delivery ignored', { deliveryId, deploymentId: existing.id });
		return json({ deploymentId: existing.id, duplicate: true }, { status: 200 });
	}

	const projectRepo = new ProjectRepository();
	const candidates = await projectRepo.getByGithubRepo(repoFullName);
	const enabled = candidates.filter(
		(p) => p.autoDeployEnabled && p.deployBranch === branch && p.targetPath
	);

	if (enabled.length === 0) {
		logger.info('Push ignored: no project configured for auto-deploy', {
			deliveryId,
			repoFullName,
			branch
		});
		return new Response(null, { status: 204 });
	}

	const worker = getDeploymentWorker();
	const deploymentIds: string[] = [];

	for (const project of enabled) {
		let deployment;
		try {
			deployment = await deploymentRepo.create({
				projectId: project.id,
				repository: repoFullName,
				branch,
				commitSha: after.toLowerCase(),
				deliveryId
			});
		} catch (err) {
			// Unique violation on delivery_id → concurrent duplicate delivery
			const dup = await deploymentRepo.getByDeliveryId(deliveryId);
			if (dup) {
				logger.info('Duplicate webhook delivery ignored (race)', { deliveryId, deploymentId: dup.id });
				continue;
			}
			throw err;
		}
		deploymentIds.push(deployment.id);
		// Fire-and-forget: the HTTP response does not wait for the deployment
		worker.enqueue(deployment.id);
		logger.info('Deployment queued', {
			deploymentId: deployment.id,
			project: project.name,
			repository: repoFullName,
			branch,
			commitSha: after
		});
	}

	if (deploymentIds.length === 0) {
		return new Response(null, { status: 204 });
	}

	return json({ ok: true, deploymentIds }, { status: 202 });
}

async function handleWebhookEvent(eventName: string, payload: Record<string, unknown>): Promise<void> {
	const installationId = (payload.installation as any)?.id;
	if (!installationId) return;

	const installationRepo = new GitHubInstallationRepository();

	switch (eventName) {
		case 'installation': {
			const action = payload.action as string;
			if (action === 'deleted') {
				await installationRepo.delete(installationId);
				logger.info('GitHub installation deleted via webhook', { installationId });
			}
			break;
		}
		case 'installation_repositories': {
			const action = payload.action as string;
			if (action === 'added' || action === 'removed') {
				const repositoriesAdded = (payload as any).repositories_added ?? [];
				const repositoriesRemoved = (payload as any).repositories_removed ?? [];
				logger.info('GitHub installation repositories changed', {
					installationId,
					added: repositoriesAdded.length,
					removed: repositoriesRemoved.length
				});
			}
			break;
		}
		default:
			break;
	}
}
