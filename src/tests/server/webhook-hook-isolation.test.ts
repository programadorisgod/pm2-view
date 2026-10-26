import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockSvelteKitHandler } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockSvelteKitHandler: vi.fn()
}));

vi.mock('$lib/auth', () => ({
	auth: {
		api: {
			getSession: mockGetSession
		}
	}
}));

vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: mockSvelteKitHandler
}));

vi.mock('$app/environment', () => ({
	building: false,
	dev: true
}));

vi.mock('$lib/sse/server', () => ({
	startMetricsEmitter: vi.fn(),
	stopMetricsEmitter: vi.fn(),
	startStatusWatcher: vi.fn(),
	stopStatusWatcher: vi.fn()
}));

vi.mock('$lib/server/containers/runtime', () => ({
	watcher: {
		stop: vi.fn()
	}
}));

import { handle } from '../../hooks.server';

function createMockEvent(pathname: string, method = 'POST', routeId: string | null = null) {
	return {
		url: new URL(`http://localhost${pathname}`),
		route: { id: routeId ?? (pathname.startsWith('/pm2') ? pathname.slice(4) : pathname) },
		request: new Request(`http://localhost${pathname}`, { method }),
		locals: {}
	};
}

describe('hooks.server.ts webhook route isolation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue(null);
		mockSvelteKitHandler.mockImplementation(async ({ resolve, event }: any) => resolve(event));
	});

	it('returns 405 Method Not Allowed for GET /api/webhooks/github with Allow: POST header', async () => {
		const event = createMockEvent('/api/webhooks/github', 'GET');
		const resolve = vi.fn();

		const response = await handle({ event, resolve } as any);

		expect(response.status).toBe(405);
		expect(response.headers.get('Allow')).toBe('POST');
		expect(mockGetSession).not.toHaveBeenCalled();
		expect(resolve).not.toHaveBeenCalled();
	});

	it('returns 405 Method Not Allowed for PUT /pm2/api/webhooks/github', async () => {
		const event = createMockEvent('/pm2/api/webhooks/github', 'PUT');
		const resolve = vi.fn();

		const response = await handle({ event, resolve } as any);

		expect(response.status).toBe(405);
		expect(response.headers.get('Allow')).toBe('POST');
		expect(mockGetSession).not.toHaveBeenCalled();
		expect(resolve).not.toHaveBeenCalled();
	});

	it('allows POST /api/webhooks/github directly via resolve without calling getSession', async () => {
		const event = createMockEvent('/api/webhooks/github', 'POST');
		const mockResponse = new Response('ok', { status: 200 });
		const resolve = vi.fn().mockResolvedValue(mockResponse);

		const response = await handle({ event, resolve } as any);

		expect(response).toBe(mockResponse);
		expect(resolve).toHaveBeenCalledTimes(1);
		expect(mockGetSession).not.toHaveBeenCalled();
		expect(mockSvelteKitHandler).not.toHaveBeenCalled();
	});

	it('allows POST /pm2/api/webhooks/github directly via resolve without calling getSession', async () => {
		const event = createMockEvent('/pm2/api/webhooks/github', 'POST');
		const mockResponse = new Response('ok', { status: 200 });
		const resolve = vi.fn().mockResolvedValue(mockResponse);

		const response = await handle({ event, resolve } as any);

		expect(response).toBe(mockResponse);
		expect(resolve).toHaveBeenCalledTimes(1);
		expect(mockGetSession).not.toHaveBeenCalled();
		expect(mockSvelteKitHandler).not.toHaveBeenCalled();
	});

	it('does NOT bypass routes with similar suffix like /admin/api/webhooks/github', async () => {
		const event = createMockEvent('/admin/api/webhooks/github', 'POST', '/admin/api/webhooks/github');
		const mockResponse = new Response('ok', { status: 200 });
		const resolve = vi.fn().mockResolvedValue(mockResponse);

		await handle({ event, resolve } as any);

		// Must pass through normal auth flow
		expect(mockGetSession).toHaveBeenCalledTimes(1);
	});
});
