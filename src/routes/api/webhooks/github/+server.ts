import { json, type RequestHandler } from '@sveltejs/kit';
import {
	GitHubWebhookVerifier,
	logInvalidSignatureThrottled
} from '$lib/github/infrastructure/github-webhook-verifier';
import {
	COMMIT_SHA_REGEX,
	isValidGitBranchName,
	isValidRepoFullName,
	readBodyBytesWithLimit
} from '$lib/github/webhook-utils';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { logger } from '$lib/logger';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { DeploymentRepository } from '$lib/db/repositories/deployment-repository.impl';
import { getDeploymentWorker } from '$lib/deploy/factory';

const SIGNATURE_REGEX = /^sha256=[0-9a-f]{64}$/i;
const DELIVERY_ID_REGEX = /^[a-zA-Z0-9-]{1,64}$/;
const EVENT_NAME_REGEX = /^[a-z_]{1,40}$/;
const CONTENT_TYPE_REGEX = /^application\/json(?:\s*;.*)?$/i;

const PROCESSED_EVENTS = new Set(['push', 'installation', 'installation_repositories']);

let verifier: GitHubWebhookVerifier | null = null;

function getVerifier(): GitHubWebhookVerifier {
	if (!verifier) {
		verifier = new GitHubWebhookVerifier();
	}
	return verifier;
}

export const POST: RequestHandler = async ({ request }) => {
	const signature = request.headers.get('x-hub-signature-256');
	const deliveryId = request.headers.get('x-github-delivery');
	const eventName = request.headers.get('x-github-event');
	const contentType = request.headers.get('content-type');

	// Step 1: Pre-stream header validation (fail-fast without consuming body)
	if (!signature || !SIGNATURE_REGEX.test(signature)) {
		return json({ error: 'Invalid webhook signature' }, { status: 401 });
	}

	if (!deliveryId || !DELIVERY_ID_REGEX.test(deliveryId)) {
		return json({ error: 'Invalid delivery header' }, { status: 400 });
	}

	if (!eventName || !EVENT_NAME_REGEX.test(eventName)) {
		return json({ error: 'Invalid event header' }, { status: 400 });
	}

	if (contentType && !CONTENT_TYPE_REGEX.test(contentType)) {
		return json({ error: 'Unsupported media type' }, { status: 415 });
	}

	// Step 2: Stream reading with real byte cap (1 MiB)
	const readResult = await readBodyBytesWithLimit(request);
	if (!readResult.ok) {
		return new Response(null, { status: readResult.status });
	}
	const rawBytes = readResult.bytes;

	// Step 3: Pure constant-time HMAC-SHA256 signature verification over raw bytes
	const webhooks = getVerifier();
	const verified = webhooks.verifySignatureBytes(rawBytes, signature);
	if (!verified) {
		logInvalidSignatureThrottled({ deliveryId, eventName, reason: 'SIGNATURE_MISMATCH' });
		return json({ error: 'Invalid webhook signature' }, { status: 401 });
	}

	// Step 4: Fast exit for valid GitHub events not processed by our application (e.g. ping)
	if (!PROCESSED_EVENTS.has(eventName)) {
		return new Response(null, { status: 204 });
	}

	// Step 5: UTF-8 fatal decoding and safe JSON parse
	let bodyText: string;
	try {
		bodyText = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
	} catch {
		return json({ error: 'Invalid UTF-8 payload' }, { status: 400 });
	}

	let payload: Record<string, unknown>;
	try {
		const parsed = JSON.parse(bodyText);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return json({ error: 'Payload must be a JSON object' }, { status: 400 });
		}
		payload = parsed as Record<string, unknown>;
	} catch {
		return json({ error: 'Invalid JSON payload' }, { status: 400 });
	}

	logger.info('GitHub webhook received', {
		event: eventName,
		deliveryId
	});

	try {
		if (eventName === 'push') {
			return await handlePushEvent(payload, deliveryId);
		}
		await handleWebhookEvent(eventName, payload);
	} catch (err) {
		logger.error('Webhook handler error', { event: eventName, error: err });
	}

	return new Response(null, { status: 204 });
};

/**
 * Handles push events for auto-deployment with strict security invariants.
 */
async function handlePushEvent(
	payload: Record<string, unknown>,
	deliveryId: string
): Promise<Response> {
	// Guard against branch deletion events: GitHub sends deleted: true and after: 0000...
	if (payload.deleted === true || (payload.deleted !== undefined && typeof payload.deleted !== 'boolean')) {
		return new Response(null, { status: 204 });
	}

	const repository = payload.repository as { full_name?: string } | undefined;
	const ref = payload.ref;
	const after = payload.after;

	const repoFullName = typeof repository?.full_name === 'string' ? repository.full_name : null;
	const branch = typeof ref === 'string' && ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;

	if (
		!repoFullName ||
		!branch ||
		typeof after !== 'string' ||
		!COMMIT_SHA_REGEX.test(after) ||
		/^0{40}$/.test(after) ||
		!isValidRepoFullName(repoFullName) ||
		!isValidGitBranchName(branch)
	) {
		logger.warn('Push webhook ignored: invalid or missing payload fields', { deliveryId, repoFullName, ref });
		return new Response(null, { status: 204 });
	}

	// Step 6: Explicit project authorization in DB BEFORE checking or writing idempotency
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

	// Step 7: Idempotency check on deliveryId
	const deploymentRepo = new DeploymentRepository();
	const existing = await deploymentRepo.getByDeliveryId(deliveryId);
	if (existing) {
		logger.info('Duplicate webhook delivery ignored', { deliveryId, deploymentId: existing.id });
		return json({ deploymentId: existing.id, duplicate: true }, { status: 200 });
	}

	// Resolve group members to their parent project so a single auto-deploy
	// config covers the entire monorepo group.
	const allProjects = await projectRepo.getAll();
	const resolvedProjects = new Map<string, typeof allProjects[0]>();

	for (const project of enabled) {
		// Check if this project is a group parent (has pm2Names)
		if (project.pm2Names) {
			try {
				const names = JSON.parse(project.pm2Names) as string[];
				if (Array.isArray(names) && names.length > 0) {
					resolvedProjects.set(project.id, project);
					continue;
				}
			} catch { /* invalid JSON — fall through */ }
		}

		// Check if this project is a member of a group
		const parent = allProjects.find((p) => {
			if (!p.pm2Names || p.pm2Name === project.pm2Name) return false;
			try {
				const names = JSON.parse(p.pm2Names) as string[];
				return names.includes(project.pm2Name);
			} catch { return false; }
		});

		if (parent) {
			// Use the parent project — it has pm2Names so the runner will restart all group members
			resolvedProjects.set(parent.id, parent);
		} else {
			// Standalone project
			resolvedProjects.set(project.id, project);
		}
	}

	const worker = getDeploymentWorker();
	const deploymentIds: string[] = [];

	for (const project of resolvedProjects.values()) {
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
				return json({ deploymentId: dup.id, duplicate: true }, { status: 200 });
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
	const rawInstallationId = (payload.installation as any)?.id;
	if (
		typeof rawInstallationId !== 'number' ||
		!Number.isSafeInteger(rawInstallationId) ||
		rawInstallationId <= 0
	) {
		return;
	}
	const installationId = rawInstallationId;

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
