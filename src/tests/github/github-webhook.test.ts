import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('$lib/db/env', () => ({
	getEnv: () => ({
		GITHUB_WEBHOOK_SECRET: 'test-secret',
		GITHUB_APP_ID: '123456',
		GITHUB_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----'
	})
}));

const { mockLogger } = vi.hoisted(() => ({
	mockLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

vi.mock('$lib/logger', () => ({
	logger: mockLogger
}));

import {
	GitHubWebhookVerifier,
	logInvalidSignatureThrottled,
	resetLogThrottleState
} from '../../../src/lib/github/infrastructure/github-webhook-verifier';

describe('GitHubWebhookVerifier', () => {
	let verifier: GitHubWebhookVerifier;

	beforeEach(() => {
		vi.clearAllMocks();
		resetLogThrottleState();
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
				'x-hub-signature-256': 'sha256=' + '0'.repeat(64)
			},
			JSON.stringify({ zen: 'test' })
		);

		expect(result.verified).toBe(false);
		expect(mockLogger.warn).toHaveBeenCalledWith(
			'Webhook verification failed',
			expect.objectContaining({
				deliveryId: 'test-delivery',
				eventName: 'ping',
				reason: 'SIGNATURE_MISMATCH'
			})
		);
	});

	it('should reject missing headers', async () => {
		const result = await verifier.verifyAndReceive({}, '{}');
		expect(result.verified).toBe(false);
	});

	it('should verify raw Uint8Array bytes directly with verifySignatureBytes', () => {
		const rawBytes = new TextEncoder().encode('{"zen":"test"}');
		const validDigest = crypto.createHmac('sha256', 'test-secret').update(rawBytes).digest('hex');
		const validSignature = `sha256=${validDigest}`;

		expect(verifier.verifySignatureBytes(rawBytes, validSignature)).toBe(true);
		expect(verifier.verifySignatureBytes(rawBytes, `sha256=${'f'.repeat(64)}`)).toBe(false);
		expect(verifier.verifySignatureBytes(rawBytes, 'invalid-format')).toBe(false);
		expect(verifier.verifySignatureBytes(rawBytes, undefined)).toBe(false);
	});

	it('should throttle invalid signature logs and emit summary on lazy window reset', () => {
		const baseTime = 1000000;

		// Send 7 invalid attempts within same window (max is 5)
		for (let i = 0; i < 7; i++) {
			logInvalidSignatureThrottled(
				{ deliveryId: `delivery-${i}`, eventName: 'push', reason: 'SIGNATURE_MISMATCH' },
				baseTime + i * 1000
			);
		}

		// Only 5 individual warnings should be logged
		expect(mockLogger.warn).toHaveBeenCalledTimes(5);

		// Next attempt in next window (> 60s later)
		logInvalidSignatureThrottled(
			{ deliveryId: 'delivery-new', eventName: 'push', reason: 'SIGNATURE_MISMATCH' },
			baseTime + 65000
		);

		// Should have logged the suppressed summary warning plus the 1 new warning
		expect(mockLogger.warn).toHaveBeenCalledWith(
			'Suppressed invalid signature attempts in previous window',
			{ count: 2 }
		);
		expect(mockLogger.warn).toHaveBeenCalledWith(
			'Webhook verification failed',
			expect.objectContaining({ deliveryId: 'delivery-new', reason: 'SIGNATURE_MISMATCH' })
		);
	});
});
