import { engine } from '$lib/server/containers/engine/engine';
import { apiOk, apiError, errorMessage } from '$lib/server/containers/api-helpers';

export async function POST({ params, request }) {
	const body = (await request.json().catch(() => ({}))) as { name?: string };
	const name = body.name || params.id.slice(0, 12);
	try {
		await engine.removeNetwork(params.id);
		return apiOk(`Red "${name}" eliminada.`);
	} catch (err) {
		return apiError(500, `No se pudo eliminar la red "${name}": ${errorMessage(err)}`);
	}
}
