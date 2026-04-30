import { auth } from '$lib/auth';
import { requireProjectAccess } from '$lib/server/route-guards';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	// Parent layout should have already checked authentication
	if (!session?.user) {
		return { user: null, session: null };
	}

	const { id: projectId } = event.params;

	// Check project membership and get member record
	const member = await requireProjectAccess(projectId, session.user.id);

	return {
		user: session.user,
		session: session.session,
		projectId,
		memberRole: member.role
	};
};
