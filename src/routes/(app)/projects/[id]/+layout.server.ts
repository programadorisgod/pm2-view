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
	// Admins have universal access, creators get 'owner' role
	const member = await requireProjectAccess(projectId, session.user);

	// Determine the effective role: from member record, or 'owner' for creator, or 'admin' for admins
	let effectiveRole: string;
	if (session.user.role === 'admin') {
		effectiveRole = 'admin';
	} else if (member) {
		effectiveRole = member.role;
	} else {
		// Project creator without explicit member record
		effectiveRole = 'owner';
	}

	return {
		user: session.user,
		session: session.session,
		projectId,
		memberRole: effectiveRole
	};
};
