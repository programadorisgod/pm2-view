import { engine } from '$lib/server/containers/engine/engine';
import { apiOk, apiError, errorMessage } from '$lib/server/containers/api-helpers';

const actions = new Set(['start', 'stop', 'restart', 'remove']);

const actionNames: Record<string, string> = {
	start: 'iniciado',
	stop: 'detenido',
	restart: 'reiniciado',
	remove: 'eliminado'
};

export async function POST({ params, request }) {
	const { id, action } = params;
	if (!actions.has(action)) {
		return apiError(400, `Acción no soportada: "${action}".`);
	}

	const body = (await request.json().catch(() => ({}))) as { name?: string };
	const name = body.name || id.slice(0, 12);

	try {
		switch (action) {
			case 'start':
				await engine.startContainer(id);
				break;
			case 'stop':
				await engine.stopContainer(id);
				break;
			case 'restart':
				await engine.restartContainer(id);
				break;
			case 'remove':
				await engine.removeContainer(id);
				break;
		}
		return apiOk(`Contenedor "${name}" ${actionNames[action]}.`);
	} catch (err) {
		return apiError(
			500,
			`No se pudo ${actionNames[action] === 'eliminado' ? 'eliminar' : actionNames[action]} "${name}": ${errorMessage(err)}`
		);
	}
}
