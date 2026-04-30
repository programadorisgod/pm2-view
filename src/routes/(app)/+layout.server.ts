import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	if (!session) {
		throw redirect(302, `${base}/login`);
	}

	return {
		user: session.user,
		session: session.session
	};
};
