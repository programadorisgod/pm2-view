import { auth } from '$lib/auth';
import { error } from '@sveltejs/kit';
import { getTeamRole } from '$lib/server/team-access';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	// Parent layout should have already checked authentication
	if (!session?.user) {
		return { user: null, session: null };
	}

	const { id: teamId } = event.params;

	// Check team membership
	const role = await getTeamRole(session.user.id, teamId);

	if (!role) {
		throw error(404, 'Team not found');
	}

	return {
		user: session.user,
		session: session.session,
		teamId,
		memberRole: role
	};
};
