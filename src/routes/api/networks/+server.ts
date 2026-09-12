import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/containers/engine/engine';
import { errorMessage } from '$lib/server/containers/api-helpers';

export async function GET() {
	try {
		const networks = await engine.listNetworks();
		return json(networks);
	} catch (err) {
		return json({ error: errorMessage(err) }, { status: 502 });
	}
}
