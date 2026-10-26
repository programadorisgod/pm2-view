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
	getByGithubRepo: vi.fn(),
	getAll: vi.fn()
};

const mockDeploymentRepo = {
	getByDeliveryId: vi.fn(),
	create: vi.fn()
};

vi.mock('$lib/db/repositories/project-repository.impl', () => ({
	ProjectRepository: class {
		getByGithubRepo = mockProjectRepo.getByGithubRepo;
		getAll = mockProjectRepo.getAll;
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
import {
	isValidGitBranchName,
	isValidRepoFullName,
	readBodyBytesWithLimit
} from '../../../src/lib/github/webhook-utils';
import type { Deployment } from '../../../src/lib/deploy/deployment.types';

const SECRET = 'test-secret';
const WEBHOOK_URL = 'http://localhost/api/webhooks/github';

function signPayload(payload: string | Uint8Array, secret = SECRET): string {
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
	body: string | Uint8Array,
	event: string,
	deliveryId: string,
	signature?: string,
	contentType = 'application/json',
	extraHeaders: Record<string, string> = {}
): Request {
	const headers: Record<string, string> = {
		'content-type': contentType,
		'x-github-event': event,
		'x-github-delivery': deliveryId,
		...extraHeaders
	};
	if (signature !== undefined) {
		headers['x-hub-signature-256'] = signature;
	}
	return new Request(WEBHOOK_URL, {
		method: 'POST',
		headers,
		body: typeof body === 'string' ? body : (body as any)
	});
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
	mockProjectRepo.getAll.mockResolvedValue([]);
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

	it('10. rejects push with malformed signature without consuming body (401)', async () => {
		const req = new Request(WEBHOOK_URL, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-github-delivery': 'del-10',
				'x-github-event': 'push',
				'x-hub-signature-256': 'sha256=not-hex'
			},
			body: JSON.stringify(buildPushPayload())
		});

		const getReaderSpy = vi.spyOn(req.body!, 'getReader');
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(401);
		expect(getReaderSpy).not.toHaveBeenCalled();
	});

	it('11. rejects push with malformed deliveryId (400)', async () => {
		const body = JSON.stringify(buildPushPayload());
		const res = await POST({
			request: buildRequest(body, 'push', 'bad/delivery/id', signPayload(body))
		} as any);

		expect(res.status).toBe(400);
	});

	it('12. rejects push with malformed event name (400)', async () => {
		const body = JSON.stringify(buildPushPayload());
		const res = await POST({
			request: buildRequest(body, '../push', 'delivery-12', signPayload(body))
		} as any);

		expect(res.status).toBe(400);
	});

	it('13. rejects push with incompatible Content-Type (415)', async () => {
		const body = JSON.stringify(buildPushPayload());
		const res = await POST({
			request: buildRequest(body, 'push', 'delivery-13', signPayload(body), 'text/plain')
		} as any);

		expect(res.status).toBe(415);
	});

	it('14. rejects body exceeding 1 MiB via Content-Length without reading stream (413)', async () => {
		const body = JSON.stringify(buildPushPayload());
		const req = buildRequest(body, 'push', 'del-14', signPayload(body));
		// The client Fetch spec marks Content-Length as a forbidden header in Request constructor,
		// but in Node.js adapter-node server requests SvelteKit populates it from incoming HTTP headers.
		const originalGet = req.headers.get.bind(req.headers);
		vi.spyOn(req.headers, 'get').mockImplementation((name) => {
			if (name.toLowerCase() === 'content-length') return (2 * 1024 * 1024).toString();
			return originalGet(name);
		});

		const getReaderSpy = vi.spyOn(req.body!, 'getReader');
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(413);
		expect(getReaderSpy).not.toHaveBeenCalled();
	});

	it('15. rejects body exceeding 1 MiB during chunk reading with 413 and cancels reader', async () => {
		let readerCancelled = false;
		const stream = new ReadableStream({
			pull(controller) {
				// Send two chunks of 600 KiB (total 1.2 MiB)
				controller.enqueue(new Uint8Array(600 * 1024));
			},
			cancel() {
				readerCancelled = true;
			}
		});

		const req = new Request(WEBHOOK_URL, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-github-delivery': 'del-15',
				'x-github-event': 'push',
				'x-hub-signature-256': 'sha256=' + 'a'.repeat(64)
			},
			body: stream,
			// @ts-expect-error duplex required for streaming request body in Node fetch
			duplex: 'half'
		});

		const res = await POST({ request: req } as any);
		expect(res.status).toBe(413);
		expect(readerCancelled).toBe(true);
	});

	it('16. rejects payload with invalid UTF-8 bytes (400)', async () => {
		// 0xFF 0xFE are invalid UTF-8 start bytes
		const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0x01, 0x02]);
		const signature = signPayload(invalidUtf8);

		const res = await POST({
			request: buildRequest(invalidUtf8, 'push', 'delivery-16', signature)
		} as any);

		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toBe('Invalid UTF-8 payload');
	});

	it('17. rejects malformed JSON with 400', async () => {
		const badJson = '{"ref": "refs/heads/main", unquoted: true}';
		const signature = signPayload(badJson);

		const res = await POST({
			request: buildRequest(badJson, 'push', 'delivery-17', signature)
		} as any);

		expect(res.status).toBe(400);
	});

	it('18. rejects non-object JSON (array) with 400', async () => {
		const arrayJson = JSON.stringify(['item1', 'item2']);
		const signature = signPayload(arrayJson);

		const res = await POST({
			request: buildRequest(arrayJson, 'push', 'delivery-18', signature)
		} as any);

		expect(res.status).toBe(400);
	});

	it('19. ignores push on branch deletion (deleted: true or all-zero SHA) with 204', async () => {
		// Deleted: true
		const deletedPayload = buildPushPayload({ deleted: true });
		const deletedBody = JSON.stringify(deletedPayload);
		const res1 = await POST({
			request: buildRequest(deletedBody, 'push', 'del-19a', signPayload(deletedBody))
		} as any);
		expect(res1.status).toBe(204);
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();

		// All-zero SHA
		const zeroShaPayload = buildPushPayload({ after: '0'.repeat(40) });
		const zeroShaBody = JSON.stringify(zeroShaPayload);
		const res2 = await POST({
			request: buildRequest(zeroShaBody, 'push', 'del-19b', signPayload(zeroShaBody))
		} as any);
		expect(res2.status).toBe(204);
		expect(mockDeploymentRepo.create).not.toHaveBeenCalled();
	});

	it('20. recovers gracefully in concurrent delivery race when create throws unique violation', async () => {
		const winnerDeployment = makeDeployment('winner-dep');
		mockDeploymentRepo.create.mockRejectedValueOnce(new Error('UNIQUE constraint failed: deployments.delivery_id'));
		mockDeploymentRepo.getByDeliveryId.mockResolvedValueOnce(winnerDeployment);

		const body = JSON.stringify(buildPushPayload());
		const res = await POST({
			request: buildRequest(body, 'push', 'del-race-20', signPayload(body))
		} as any);

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.duplicate).toBe(true);
		expect(data.deploymentId).toBe('winner-dep');
		expect(mockEnqueue).not.toHaveBeenCalled();
	});

	it('21. validates branch names with isValidGitBranchName matching Git rules', () => {
		// Valid branches
		expect(isValidGitBranchName('main')).toBe(true);
		expect(isValidGitBranchName('feature/v2.0-auth')).toBe(true);
		expect(isValidGitBranchName('release/1.0.0')).toBe(true);
		expect(isValidGitBranchName('user-branch_1')).toBe(true);

		// Invalid branches
		expect(isValidGitBranchName('@')).toBe(false); // Isolated @
		expect(isValidGitBranchName('-main')).toBe(false); // Starts with -
		expect(isValidGitBranchName('/main')).toBe(false); // Starts with /
		expect(isValidGitBranchName('.main')).toBe(false); // Starts with .
		expect(isValidGitBranchName('main/')).toBe(false); // Ends with /
		expect(isValidGitBranchName('main.')).toBe(false); // Ends with .
		expect(isValidGitBranchName('main.lock')).toBe(false); // Ends with .lock
		expect(isValidGitBranchName('feature/main.lock')).toBe(false); // Component ends with .lock
		expect(isValidGitBranchName('feature/.hidden')).toBe(false); // Component starts with .
		expect(isValidGitBranchName('a..b')).toBe(false); // Contains ..
		expect(isValidGitBranchName('a@{0}')).toBe(false); // Contains @{
		expect(isValidGitBranchName('a//b')).toBe(false); // Contains //
		expect(isValidGitBranchName('main branch')).toBe(false); // Contains space
		expect(isValidGitBranchName('main~1')).toBe(false); // Contains ~
		expect(isValidGitBranchName('main^')).toBe(false); // Contains ^
		expect(isValidGitBranchName('main:sub')).toBe(false); // Contains :
		expect(isValidGitBranchName('main?')).toBe(false); // Contains ?
		expect(isValidGitBranchName('main*')).toBe(false); // Contains *
		expect(isValidGitBranchName('main[0]')).toBe(false); // Contains [
		expect(isValidGitBranchName('main\\sub')).toBe(false); // Contains \
	});

	it('22. validates repository full_name with isValidRepoFullName', () => {
		expect(isValidRepoFullName('owner/project')).toBe(true);
		expect(isValidRepoFullName('org-name/repo.impl_1')).toBe(true);

		expect(isValidRepoFullName('owner/..')).toBe(false);
		expect(isValidRepoFullName('../repo')).toBe(false);
		expect(isValidRepoFullName('owner/../evil')).toBe(false);
		expect(isValidRepoFullName('owner/repo.lock')).toBe(false);
		expect(isValidRepoFullName('single-name')).toBe(false);
		expect(isValidRepoFullName('too/many/parts')).toBe(false);
	});
});
