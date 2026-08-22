import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('$lib/db/env', () => ({
	getEnv: () => ({
		GITHUB_WEBHOOK_SECRET: 'test-secret',
		GITHUB_APP_ID: '123456',
		GITHUB_PRIVATE_KEY:
			'-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----'
	})
}));

const mockProjectRepo = {
	getByGithubRepo: vi.fn()
};

const mockDeploymentRepo = {
	getByDeliveryId: vi.fn(),
	create: vi.fn()
};

vi.mock('$lib/db/repositories/project-repository.impl', () => ({
	ProjectRepository: class {
		getByGithubRepo = mockProjectRepo.getByGithubRepo;
	}
}));

vi.mock('$lib/db/repositories/deployment-repository.impl', () => ({
	DeploymentRepository: class {
		getByDeliveryId = mockDeploymentRepo.getByDeliveryId;
		create = mockDeploymentRepo.create;
	}
}));

const mockEnqueue = vi.fn();
vi.mock('$lib/deploy/factory', () => ({
	getDeploymentWorker: () => ({ enqueue: mockEnqueue })
}));

import { POST } from '../../../src/routes/api/webhooks/github/+server';
import type { Deployment } from '../../../src/lib/deploy/deployment.types';

const SECRET = 'test-secret';
const WEBHOOK_URL = 'http://localhost/api/webhooks/github';

function signPayload(payload: string, secret = SECRET): string {
	return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function buildPushPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		ref: 'refs/heads/main',
		before: '0'.repeat(40),
		after: 'a'.repeat(40),
		repository: { full_name: 'owner/project' },
		sender: { login: 'someone' },
		...overrides
	};
}

function buildRequest(
	body: string,
	event: string,
	deliveryId: string,
	signature?: string
): Request {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		'x-github-event': event,
		'x-github-delivery': deliveryId
	};
	if (signature !== undefined) {
		headers['x-hub-signature-256'] = signature;
	}
	return new Request(WEBHOOK_URL, { method: 'POST', headers, body });
}

function makeDeployment(id: string): Partial<Deployment> {
	return {
		id,
		projectId: 'project-1',
		repository: 'owner/project',
		branch: 'main',
		commitSha: 'a'.repeat(40),
		deliveryId: crypto.randomUUID(),
		status: 'pending',
		logs: '',
		createdAt: new Date()
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDeploymentRepo.getByDeliveryId.mockResolvedValue(null);
	mockDeploymentRepo.create.mockImplementation(async (input) =>
		makeDeployment('dep-' + Math.random().toString(36).slice(2, 8))
	);
	mockProjectRepo.getByGithubRepo.mockResolvedValue([
		{
			id: 'project-1',
			name: 'Project One',
			pm2Name: 'project-one',
			targetPath: '/opt/projects/one',
			githubRepo: 'owner/project',
			deployBranch: 'main',
			autoDeployEnabled: true,
			userId: 'user-1',
			createdAt: new Date()
		}
	]);
});

describe('POST /api/webhooks/github — push events', () => {
	it('1. accepts a valid push webhook and queues a deployment (202)', async () => {
		const body = JSON.stringify(buildPushPayload());
		const res = await POST({
			request: buildRequest(body, 'push', 'delivery-1', signPayload(body))
		} as any);

		expect(res.status).toBe(202);
		const data = await res.json();
		expect(data.deploymentIds).toHaveLength(1);
		expect(mockDeploymentRepo.create).toHaveBeenCalledTimes(1);
		expect(mockDeploymentRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				repository: 'owner/project',
				branch: 'main',
				commitSha: 'a'.repeat(40),
				deliveryId: 'delivery-1'
			})
		);
		expect(mockEnqueue).toHaveBeenCalledTimes(1);
	});

	it('2. rejects a webhook with an invalid signature (401)', async () => {
		const body = JSON.stringify(buildPushPayload());
		const badSignature = signPayload(body, 'wrong-secret');
		const res = await POST({
			request: buildRequest(body, 'push', 'delivery-2', badSignature)
		} as any);

		expect(res.status).toBe(401);
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
	});

	it('3. rejects a webhook without a signature header (401)', async () => {
		const body = JSON.stringify(buildPushPayload());
		const res = await POST({
			request: buildRequest(body, 'push', 'delivery-3')
		} as any);

		expect(res.status).toBe(401);
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
	});

	it('4. ignores non-push events with 204 and creates no deployment', async () => {
		const body = JSON.stringify({ zen: 'Keep it logically awesome.' });
		const res = await POST({
			request: buildRequest(body, 'ping', 'delivery-4', signPayload(body))
		} as any);

		expect(res.status).toBe(204);
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	it('5. ignores a push to a different branch than configured (204)', async () => {
		const body = JSON.stringify(
			buildPushPayload({ ref: 'refs/heads/develop' })
		);
		const res = await POST({
			request: buildRequest(body, 'push', 'delivery-5', signPayload(body))
		} as any);

		expect(res.status).toBe(204);
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	it('6. ignores a push for an unknown repository (204)', async () => {
		mockProjectRepo.getByGithubRepo.mockResolvedValue([]);
		const body = JSON.stringify(
			buildPushPayload({ repository: { full_name: 'unknown/repo' } })
		);
		const res = await POST({
			request: buildRequest(body, 'push', 'delivery-6', signPayload(body))
		} as any);

		expect(res.status).toBe(204);
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
	});

	it('7. does not create a second deployment for a duplicate delivery', async () => {
		const existing = makeDeployment('existing-dep');
		mockDeploymentRepo.getByDeliveryId.mockResolvedValue(existing);

		const body = JSON.stringify(buildPushPayload());
		const res = await POST({
			request: buildRequest(body, 'push', 'delivery-7', signPayload(body))
		} as any);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.duplicate).toBe(true);
		expect(data.deploymentId).toBe('existing-dep');
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	it('8. ignores a push when auto-deploy is disabled for the project (204)', async () => {
		mockProjectRepo.getByGithubRepo.mockResolvedValue([
			{
				id: 'project-2',
				name: 'Disabled Project',
				pm2Name: 'disabled',
				targetPath: '/opt/projects/two',
				githubRepo: 'owner/project',
				deployBranch: 'main',
				autoDeployEnabled: false,
				userId: 'user-1',
				createdAt: new Date()
			}
		]);

		const body = JSON.stringify(buildPushPayload());
		const res = await POST({
			request: buildRequest(body, 'push', 'delivery-8', signPayload(body))
		} as any);

		expect(res.status).toBe(204);
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
	});

	it('9. ignores a push whose after SHA is not a valid commit SHA (204)', async () => {
		const body = JSON.stringify(buildPushPayload({ after: 'not-a-sha; rm -rf /' }));
		const res = await POST({
			request: buildRequest(body, 'push', 'delivery-9', signPayload(body))
		} as any);

		expect(res.status).toBe(204);
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
	});
});
