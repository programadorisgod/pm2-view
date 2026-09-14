import { redirect, type ServerLoad } from '@sveltejs/kit';
import { base } from '$app/paths';

export const load: ServerLoad = async () => {
	// Public sign-up is disabled, redirect to login
	throw redirect(303, `${base}/login`);
};
