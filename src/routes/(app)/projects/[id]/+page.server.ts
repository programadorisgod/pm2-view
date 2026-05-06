import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { EnvVarService } from '$lib/env-vars/env-var.service';
import { createServices } from '$lib/services/factory';
import { auth } from '$lib/auth';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
	const { pm2Service, envVarService } = createServices();
	const { id } = params;

	const process = await pm2Service.getProcessById(id);

	if (!process) {
		throw error(404, `Process with ID ${id} not found`);
	}

	// Get logs (limited to 50 lines for the detail page)
	const logs = await pm2Service.getProcessLogs(id, 50);

	// Get environment variables
	const envVars = await envVarService.getEnvVars(id);

	// Get favorite status
	let isFavorite = false;
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (session?.user) {
			const { ProjectFavoriteRepository } = await import('$lib/db/repositories/project-favorite-repository.impl');
			const favRepo = new ProjectFavoriteRepository();
			isFavorite = await favRepo.isFavorite(session.user.id, process.name);
		}
	} catch {
		// Silent fail - favorite status is non-critical
	}

	return {
		process,
		logs,
		envVars,
		isFavorite
	};
};
