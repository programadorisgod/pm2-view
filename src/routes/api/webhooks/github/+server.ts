import { json, type RequestHandler } from '@sveltejs/kit';
import { GitHubWebhookVerifier } from '$lib/github/infrastructure/github-webhook-verifier';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubSetupService } from '$lib/github/github-setup.service';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { logger } from '$lib/logger';

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
		return json({ ok: true });
	}

	const { name: eventName, payload } = result.event;
	logger.info('GitHub webhook received', { event: eventName });

	try {
		await handleWebhookEvent(eventName, payload);
	} catch (err) {
		logger.error('Webhook handler error', { event: eventName, error: err });
	}

	return json({ ok: true });
};

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
