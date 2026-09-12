import { json, type RequestHandler } from '@sveltejs/kit';
import { engine } from '$lib/server/containers/engine/engine';
import { watcher } from '$lib/server/containers/runtime';
import { errorMessage } from '$lib/server/containers/api-helpers';

export const GET: RequestHandler = async (event: any) => {
	const locals = event?.locals;
	if (locals?.user && locals.user.role !== 'admin') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	try {
		const containers = await engine.listContainers();
		const highlighted = new Set(watcher.state.targets.map((t: any) => t.id));
		return json(containers.map((c: any) => ({ ...c, highlighted: highlighted.has(c.id) })));
	} catch (err) {
		return json({ error: errorMessage(err) }, { status: 502 });
	}
}
