import type { Actions, PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubSetupService } from '$lib/github/github-setup.service';
import { logger } from '$lib/logger';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	logger.info('[github-setup] load called', {
		userId: user?.id,
		hasUser: !!user,
		searchParams: Object.fromEntries(url.searchParams.entries())
	});

	if (!user) {
		logger.error('[github-setup] Unauthorized - no user in session');
		throw error(401, 'Unauthorized');
	}

	const installationId = url.searchParams.get('installation_id');
	const setupAction = url.searchParams.get('setup_action');

	logger.info('[github-setup] params', { installationId, setupAction });

	if (setupAction === 'request' && !installationId) {
		logger.info('[github-setup] OAuth authorization step', { setupAction });
		return { success: false, message: 'pending', isOAuthRequest: true };
	}

	if (!installationId || setupAction !== 'install') {
		logger.warn('[github-setup] Invalid setup parameters', { installationId, setupAction });
		return { success: false, message: 'Invalid setup parameters', isOAuthRequest: false };
	}

	const parsedId = Number(installationId);
	if (isNaN(parsedId) || parsedId <= 0) {
		return { success: false, message: 'Invalid installation ID' };
	}

	const installationRepo = new GitHubInstallationRepository();
	const appClient = new GitHubAppClient();
	const setupService = new GitHubSetupService(installationRepo, appClient);

	try {
		logger.info('[github-setup] Calling handleSetupCallback', { userId: user.id, installationId: parsedId });
		await setupService.handleSetupCallback(user.id, parsedId);
		logger.info('[github-setup] Setup callback successful', { userId: user.id, installationId: parsedId });
		return { success: true, message: 'GitHub connected successfully' };
	} catch (err: any) {
		logger.error('[github-setup] Setup callback failed', { error: err.message, stack: err.stack });
		if (err.status) throw err;
		return { success: false, message: err.message || 'Failed to complete GitHub setup' };
	}
};
