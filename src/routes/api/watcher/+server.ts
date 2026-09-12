import { json } from '@sveltejs/kit';
import { watcher } from '$lib/server/containers/runtime';
import { apiError } from '$lib/server/containers/api-helpers';

export async function GET() {
	return json(watcher.state);
}

export async function POST({ request }) {
	const body = (await request.json().catch(() => ({}))) as {
		enabled?: boolean;
		intervalMs?: number;
	};
	try {
		const state = watcher.update({ enabled: body.enabled, intervalMs: body.intervalMs });
		if (state.enabled) watcher.ensureRunning();
		else watcher.stop();
		return json(state);
	} catch (err) {
		return apiError(500, `No se pudo actualizar el vigilante: ${(err as Error).message}`);
	}
}
