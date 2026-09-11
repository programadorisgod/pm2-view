import { sseManager } from '$lib/sse/server';
import { auth } from '$lib/auth';
import { logger } from '$lib/logger';
import type { RequestHandler } from './$types';

const HEADERS = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache',
	'Connection': 'keep-alive',
	'X-Accel-Buffering': 'no',
};

export const GET: RequestHandler = async ({ request, setHeaders }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	const user = session.user as any;
	if (user.banned) {
		return new Response(JSON.stringify({ error: 'Account is banned' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const connectionId = crypto.randomUUID();

	const stream = new ReadableStream({
		start(controller) {
			const writer = {
				write: async (chunk: Uint8Array) => {
					controller.enqueue(chunk);
				},
				releaseLock: () => {},
			};

			sseManager.addConnection(connectionId, writer);
			sseManager.startHeartbeat();

			logger.info('SSE client connected', { connectionId });
		},
		cancel() {
			sseManager.removeConnection(connectionId);
			logger.info('SSE client disconnected', { connectionId });

			if (sseManager.getConnectionCount() === 0) {
				sseManager.stopHeartbeat();
			}
		},
	});

	for (const [key, value] of Object.entries(HEADERS)) {
		setHeaders({ [key]: value });
	}

	return new Response(stream);
};
