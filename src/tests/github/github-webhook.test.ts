import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/db/env', () => ({
	getEnv: () => ({
		GITHUB_WEBHOOK_SECRET: 'test-secret',
		GITHUB_APP_ID: '123456',
		GITHUB_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----'
	})
}));

import { GitHubWebhookVerifier } from '../../../src/lib/github/infrastructure/github-webhook-verifier';

describe('GitHubWebhookVerifier', () => {
	let verifier: GitHubWebhookVerifier;

	beforeEach(() => {
		vi.clearAllMocks();
		verifier = new GitHubWebhookVerifier();
	});

	it('should be instantiable with valid config', () => {
		expect(verifier).toBeInstanceOf(GitHubWebhookVerifier);
	});

	it('should reject invalid webhook signature', async () => {
		const result = await verifier.verifyAndReceive(
			{
				'x-github-delivery': 'test-delivery',
				'x-github-event': 'ping',
				'x-hub-signature-256': 'sha256=invalid-signature'
			},
			JSON.stringify({ zen: 'test' })
		);

		expect(result.verified).toBe(false);
	});

	it('should reject missing headers', async () => {
		const result = await verifier.verifyAndReceive({}, '{}');
		expect(result.verified).toBe(false);
	});

	it('should have on method for registering handlers', () => {
		expect(typeof verifier.on).toBe('function');
	});
});
