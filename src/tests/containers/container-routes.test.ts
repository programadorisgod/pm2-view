import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/containers/engine/engine', () => ({
	engine: {
		listContainers: vi.fn().mockResolvedValue([
			{
				id: 'c1',
				name: 'web-app',
				image: 'node:20',
				running: true,
				state: 'running',
				status: 'Up 2 hours',
				created: Date.now(),
				ports: [],
				names: ['web-app'],
				imageId: 'img1',
				highlighted: false
			}
		]),
		listImages: vi.fn().mockResolvedValue([
			{
				id: 'sha256:img1',
				repoTags: ['node:20'],
				repoDigests: [],
				created: Date.now(),
				size: 1024000,
				sharedSize: 0,
				containers: 1,
				labels: {},
				reference: 'node:20'
			}
		]),
		listVolumes: vi.fn().mockResolvedValue([
			{
				name: 'db_data',
				driver: 'local',
				mountpoint: '/var/lib/docker/volumes/db_data/_data',
				scope: 'local',
				labels: {}
			}
		]),
		listNetworks: vi.fn().mockResolvedValue([
			{
				id: 'net1',
				name: 'bridge',
				driver: 'bridge',
				scope: 'local',
				internal: false,
				containersCount: 1
			}
		]),
		getStatus: vi.fn().mockResolvedValue([
			{
				engine: 'podman',
				running: true,
				version: '4.9.3',
				apiVersion: '1.41',
				socketPath: '/run/user/1000/podman/podman.sock'
			}
		]),
		startContainer: vi.fn().mockResolvedValue(undefined),
		stopContainer: vi.fn().mockResolvedValue(undefined),
		restartContainer: vi.fn().mockResolvedValue(undefined),
		removeContainer: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/server/containers/runtime', () => ({
	watcher: {
		state: {
			enabled: false,
			intervalMs: 30000,
			alertCount: 0,
			lastRunAt: null,
			lastAlertAt: null,
			targets: [{ id: 'c1', name: 'web-app' }]
		},
		setTarget: vi.fn().mockReturnValue(true),
		removeTarget: vi.fn().mockReturnValue(true),
		update: vi.fn().mockReturnValue({ enabled: true, intervalMs: 30000 }),
		runOnce: vi.fn().mockResolvedValue({ checked: 1, down: [], notified: false })
	}
}));

vi.mock('$lib/server/containers/settings', () => ({
	settingsService: {
		get: vi.fn().mockReturnValue({
			to: 'ops@example.com',
			from: 'alerts@example.com',
			multiTo: false,
			enabledChannels: ['console']
		}),
		update: vi.fn().mockReturnValue({
			to: 'ops@example.com',
			from: 'alerts@example.com',
			multiTo: false,
			enabledChannels: ['console']
		}),
		listChannels: vi.fn().mockReturnValue([
			{ type: 'console', label: 'Consola', description: 'Log del servidor', configured: true }
		])
	}
}));

describe('Container API routes incorporation', () => {
	it('GET /api/containers returns list with highlight flags', async () => {
		const { GET } = await import('$lib/../../src/routes/api/containers/+server');
		const res = await GET();
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(Array.isArray(data)).toBe(true);
		expect(data[0].name).toBe('web-app');
		expect(data[0].highlighted).toBe(true);
	});

	it('GET /api/images returns images list', async () => {
		const { GET } = await import('$lib/../../src/routes/api/images/+server');
		const res = await GET();
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(Array.isArray(data)).toBe(true);
		expect(data[0].reference).toBe('node:20');
	});

	it('GET /api/volumes returns volumes list', async () => {
		const { GET } = await import('$lib/../../src/routes/api/volumes/+server');
		const res = await GET();
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data[0].name).toBe('db_data');
	});

	it('GET /api/networks returns networks list', async () => {
		const { GET } = await import('$lib/../../src/routes/api/networks/+server');
		const res = await GET();
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data[0].name).toBe('bridge');
	});

	it('GET /api/status returns engine and watcher status', async () => {
		const { GET } = await import('$lib/../../src/routes/api/status/+server');
		const res = await GET();
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.status[0].engine).toBe('podman');
		expect(data.watcher.targetCount).toBe(1);
	});

	it('POST /api/containers/[id]/[action] executes action', async () => {
		const { POST } = await import('$lib/../../src/routes/api/containers/[id]/[action]/+server');
		const event = {
			params: { id: 'c1', action: 'restart' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'c1' })
			})
		} as unknown as Parameters<typeof POST>[0];

		const res = await POST(event);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.ok).toBe(true);
		expect(data.message).toContain('c1');
	});
});
