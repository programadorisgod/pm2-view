import { createProjectListingService } from '$lib/services/project-listing.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;

	if (!user) {
		return { processes: [], summary: { total: 0, running: 0, stopped: 0, errored: 0 } };
	}

	const listingService = createProjectListingService();
	const visibleProjects = await listingService.getVisibleProjects(user.id, user.role);

	return {
		processes: visibleProjects,
		summary: {
			total: visibleProjects.length,
			running: visibleProjects.filter(p => p.status === 'online').length,
			stopped: visibleProjects.filter(p => p.status === 'stopped').length,
			errored: visibleProjects.filter(p => p.status === 'error' || p.status === 'errored').length
		}
	};
};
