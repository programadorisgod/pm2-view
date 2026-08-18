import { App } from 'octokit';
import { getEnv } from '$lib/db/env';
import { logger } from '$lib/logger';

export interface WebhookEvent {
	name: string;
	payload: Record<string, unknown>;
}

export class GitHubWebhookVerifier {
	private app: App;

	constructor() {
		const env = getEnv();
		const secret = env.GITHUB_WEBHOOK_SECRET;
		const appId = env.GITHUB_APP_ID;
		const privateKey = env.GITHUB_PRIVATE_KEY;

		if (!secret) {
			throw new Error('GITHUB_WEBHOOK_SECRET is required');
		}
		if (!appId || !privateKey) {
			throw new Error('GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required for webhook verification');
		}

		this.app = new App({
			appId: Number(appId),
			privateKey,
			webhooks: { secret }
		});
	}

	on(event: string, handler: (event: WebhookEvent) => Promise<void>): void {
		this.app.webhooks.on(event as any, async (webhookEvent: any) => {
			try {
				await handler({
					name: webhookEvent.name,
					payload: webhookEvent.payload as Record<string, unknown>
				});
			} catch (err) {
				logger.error('Webhook handler error', { event, error: err });
			}
		});
	}

	async verifyAndReceive(
		headers: Record<string, string>,
		body: string
	): Promise<{ verified: boolean; event?: WebhookEvent }> {
		const deliveryId = headers['x-github-delivery'];
		const eventName = headers['x-github-event'];
		const signature = headers['x-hub-signature-256'];

		if (!deliveryId || !eventName || !signature) {
			return { verified: false };
		}

		try {
			await this.app.webhooks.verifyAndReceive({
				id: deliveryId,
				name: eventName,
				signature,
				payload: body
			});
			return {
				verified: true,
				event: { name: eventName, payload: JSON.parse(body) }
			};
		} catch (err) {
			logger.warn('Webhook verification failed', { deliveryId, eventName, error: err });
			return { verified: false };
		}
	}
}
