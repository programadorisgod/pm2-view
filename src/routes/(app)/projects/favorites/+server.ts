import { auth } from '$lib/auth';
import { ProjectFavoriteRepository } from '$lib/db/repositories/project-favorite-repository.impl';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const favoriteRepo = new ProjectFavoriteRepository();

export const POST: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { pm2Name } = body;

	if (!pm2Name || typeof pm2Name !== 'string') {
		return json({ error: 'pm2Name is required' }, { status: 400 });
	}

	try {
		const isFavorite = await favoriteRepo.toggle(session.user.id, pm2Name);
		return json({ success: true, isFavorite });
	} catch (e) {
		return json({ error: 'Failed to toggle favorite' }, { status: 500 });
	}
};
