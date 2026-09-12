import { json } from '@sveltejs/kit';
import { watcher } from '$lib/server/containers/runtime';
import { apiError, errorMessage } from '$lib/server/containers/api-helpers';

export async function POST({ params, request }) {
	const body = (await request.json().catch(() => ({}))) as { highlighted?: boolean; name?: string };
	const highlighted = body.highlighted !== false;
	try {
		const state = await watcher.setHighlighted(
			params.id,
			body.name || params.id.slice(0, 12),
			highlighted
		);
		return json({
			ok: true,
			message: highlighted
				? 'Contenedor añadido al vigilante.'
				: 'Contenedor removido del vigilante.',
			highlighted,
			watch: state
		});
	} catch (err) {
		return apiError(500, `No se pudo actualizar el destaque: ${errorMessage(err)}`);
	}
}
