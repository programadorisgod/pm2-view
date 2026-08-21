import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { createServices } from '$lib/services/factory';
import { auth } from '$lib/auth';
import { db } from '$lib/db';
import { eq } from 'drizzle-orm';
import { projects } from '$lib/db/schema';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
	const { pm2Service } = createServices();
	const { id } = params;

	const process = await pm2Service.getProcessById(id);

	if (!process) {
		throw error(404, `Process with ID ${id} not found`);
	}

	// Get logs (limited to 50 lines for the detail page)
	const logs = await pm2Service.getProcessLogs(id, 50);

	// Get session for user-dependent operations
	const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);

	// Get favorite status
	let isFavorite = false;
	try {
		if (session?.user) {
			const { ProjectFavoriteRepository } = await import('$lib/db/repositories/project-favorite-repository.impl');
			const favRepo = new ProjectFavoriteRepository();
			isFavorite = await favRepo.isFavorite(session.user.id, process.name);
		}
	} catch {
		// Silent fail - favorite status is non-critical
	}

	// Get deploy configuration (auto-provisions project if not registered)
	let deployConfig = { install: [], build: [], restart: [] };
	let projectInternalId: string | null = null;
	try {
		// Find project by pm2_name to get internal ID
		let project = await db.query.projects.findFirst({
			where: eq(projects.pm2Name, process.name),
			columns: { id: true }
		});

		// Auto-provision: register project if it doesn't exist yet
		if (!project && session?.user) {
			const [created] = await db.insert(projects).values({
				id: crypto.randomUUID(),
				userId: session.user.id,
				name: process.name,
				pm2Name: process.name,
				description: `PM2 process: ${process.name}`,
				targetPath: process.pm2_env.pm_cwd || null,
			}).returning();
			project = created;
		}

		if (project) {
			projectInternalId = project.id;
			const deployConfigRepo = new DeployConfigRepository();
			const commands = await deployConfigRepo.getByProjectId(project.id);
			// Group by command type
			deployConfig = {
				install: commands.filter((c) => c.commandType === 'install'),
				build: commands.filter((c) => c.commandType === 'build'),
				restart: commands.filter((c) => c.commandType === 'restart'),
			};
		}
	} catch {
		// Non-critical: deploy config fetch failure
	}

	return {
		process,
		logs,
		isFavorite,
		deployConfig,
		projectInternalId,
	};
};
