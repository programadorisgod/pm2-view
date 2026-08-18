import type { Actions, PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubSetupService } from '$lib/github/github-setup.service';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const installationId = url.searchParams.get('installation_id');
	const setupAction = url.searchParams.get('setup_action');

	if (!installationId || setupAction !== 'install') {
		return { success: false, message: 'Invalid setup parameters' };
	}

	const parsedId = Number(installationId);
	if (isNaN(parsedId) || parsedId <= 0) {
		return { success: false, message: 'Invalid installation ID' };
	}

	const installationRepo = new GitHubInstallationRepository();
	const appClient = new GitHubAppClient();
	const setupService = new GitHubSetupService(installationRepo, appClient);

	try {
		await setupService.handleSetupCallback(user.id, parsedId);
		return { success: true, message: 'GitHub connected successfully' };
	} catch (err: any) {
		if (err.status) throw err;
		return { success: false, message: err.message || 'Failed to complete GitHub setup' };
	}
};
