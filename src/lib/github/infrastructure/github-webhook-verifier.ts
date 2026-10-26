import crypto from 'node:crypto';
import { App } from 'octokit';
import { getEnv } from '$lib/db/env';
import { logger } from '$lib/logger';

export interface WebhookEvent {
	name: string;
	payload: Record<string, unknown>;
}

export interface ThrottledLogOptions {
	deliveryId?: string;
	eventName?: string;
	reason: 'SIGNATURE_MISMATCH' | 'MALFORMED_SIGNATURE' | 'INVALID_JSON_PAYLOAD';
}

let logWindowStartMs = 0;
let logsInWindow = 0;
let suppressedCount = 0;
const MAX_LOGS_PER_WINDOW = 5;
const WINDOW_MS = 60_000;

export function resetLogThrottleState(): void {
	logWindowStartMs = 0;
	logsInWindow = 0;
	suppressedCount = 0;
}

export function logInvalidSignatureThrottled(options: ThrottledLogOptions, nowMs = Date.now()): void {
	// Lazy window reset without timers
	if (nowMs - logWindowStartMs >= WINDOW_MS) {
		if (suppressedCount > 0) {
			logger.warn('Suppressed invalid signature attempts in previous window', { count: suppressedCount });
		}
		logWindowStartMs = nowMs;
		logsInWindow = 0;
		suppressedCount = 0;
	}

	if (logsInWindow < MAX_LOGS_PER_WINDOW) {
		logsInWindow++;
		const safeDeliveryId =
			typeof options.deliveryId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(options.deliveryId)
				? options.deliveryId
				: undefined;
		const safeEventName =
			typeof options.eventName === 'string' && /^[a-z_]{1,40}$/.test(options.eventName)
				? options.eventName
				: undefined;
		logger.warn('Webhook verification failed', {
			deliveryId: safeDeliveryId,
			eventName: safeEventName,
			reason: options.reason
		});
	} else {
		suppressedCount++;
	}
}

export class GitHubWebhookVerifier {
	private app: App;
	private readonly secret: string;

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

		this.secret = secret;
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

	/**
	 * Pure, constant-time HMAC-SHA256 signature verification directly over raw bytes.
	 * Side-effect free (no logging or payload decoding).
	 */
	verifySignatureBytes(rawBody: Uint8Array, signatureHeader?: string): boolean {
		if (!signatureHeader || !this.secret) {
			return false;
		}

		const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader);
		if (!match) {
			return false;
		}

		try {
			const expectedDigest = crypto.createHmac('sha256', this.secret).update(rawBody).digest();
			const providedDigest = Buffer.from(match[1], 'hex');
			if (expectedDigest.length !== providedDigest.length) {
				return false;
			}
			return crypto.timingSafeEqual(expectedDigest, providedDigest);
		} catch {
			return false;
		}
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

		const rawBytes = new TextEncoder().encode(body);
		const verified = this.verifySignatureBytes(rawBytes, signature);
		if (!verified) {
			logInvalidSignatureThrottled({ deliveryId, eventName, reason: 'SIGNATURE_MISMATCH' });
			return { verified: false };
		}

		try {
			const parsed = JSON.parse(body);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				return { verified: false };
			}
			return {
				verified: true,
				event: { name: eventName, payload: parsed }
			};
		} catch {
			logInvalidSignatureThrottled({ deliveryId, eventName, reason: 'INVALID_JSON_PAYLOAD' });
			return { verified: false };
		}
	}
}
