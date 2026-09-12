import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/containers/engine/engine';
import { watcher } from '$lib/server/containers/runtime';
import { errorMessage } from '$lib/server/containers/api-helpers';

export async function GET() {
	try {
		const containers = await engine.listContainers();
		const highlighted = new Set(watcher.state.targets.map((t) => t.id));
		return json(containers.map((c) => ({ ...c, highlighted: highlighted.has(c.id) })));
	} catch (err) {
		return json({ error: errorMessage(err) }, { status: 502 });
	}
}
