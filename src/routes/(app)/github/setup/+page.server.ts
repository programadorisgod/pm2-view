import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubSetupService } from '$lib/github/github-setup.service';
import { logger } from '$lib/logger';
import { getEnv } from '$lib/db/env';

const OAUTH_STATE_COOKIE = 'github_oauth_state';
const OAUTH_INSTALLATION_COOKIE = 'github_oauth_installation_id';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
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
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	logger.info('[github-setup] params', { installationId, setupAction, hasCode: !!code, hasState: !!state });

	const installationRepo = new GitHubInstallationRepository();
	const appClient = new GitHubAppClient();
	const setupService = new GitHubSetupService(installationRepo, appClient);

	// Case 1: OAuth callback — GitHub redirected back with ?code=XXX
	if (code) {
		const savedState = cookies.get(OAUTH_STATE_COOKIE);
		const savedInstallationId = cookies.get(OAUTH_INSTALLATION_COOKIE);

		cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });
		cookies.delete(OAUTH_INSTALLATION_COOKIE, { path: '/' });

		if (!savedState || state !== savedState) {
			logger.warn('[github-setup] OAuth state mismatch', { hasSavedState: !!savedState });
			return { success: false, message: 'Invalid OAuth state' };
		}

		try {
			// Exchange code for access token
			const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify({
					client_id: appClient.clientId,
					client_secret: appClient.clientSecret,
					code
				})
			});

			const tokenData = await tokenRes.json();
			if (tokenData.error) {
				logger.error('[github-setup] OAuth token exchange failed', { error: tokenData.error });
				return { success: false, message: 'GitHub authorization failed' };
			}

			const accessToken = tokenData.access_token;

			// Fetch the user's installations
			const installationsRes = await fetch('https://api.github.com/user/installations', {
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Accept': 'application/vnd.github+json'
				}
			});

			const installationsData = await installationsRes.json();
			const installations = installationsData.installations ?? [];

			if (installations.length === 0) {
				logger.warn('[github-setup] No installations found for user after OAuth');
				return { success: false, message: 'No GitHub App installation found. Please install the app first.' };
			}

			// Use saved installation_id if available, otherwise use the first one
			let targetInstallationId: number;
			if (savedInstallationId) {
				targetInstallationId = Number(savedInstallationId);
			} else {
				targetInstallationId = installations[0].id;
			}

			logger.info('[github-setup] OAuth completed, saving installation', {
				userId: user.id,
				installationId: targetInstallationId
			});

			await setupService.handleSetupCallback(user.id, targetInstallationId);
			return { success: true, message: 'GitHub connected successfully' };
		} catch (err: any) {
			logger.error('[github-setup] OAuth callback failed', { error: err.message, stack: err.stack });
			if (err.status) throw err;
			return { success: false, message: err.message || 'Failed to complete GitHub setup' };
		}
	}

	// Case 2: OAuth request — GitHub sent setup_action=request, redirect to OAuth
	if (setupAction === 'request' && !installationId) {
		const state = crypto.randomUUID();
		const clientId = appClient.clientId;

		// Build redirect URI from the current URL origin + base path
		const origin = url.origin;
		const basePath = getEnv().APP_BASE_PATH ?? '';
		const redirectUri = `${origin}${basePath}/github/setup`;

		const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read%3Auser&state=${state}`;

		cookies.set(OAUTH_STATE_COOKIE, state, { path: '/' });
		cookies.set(OAUTH_INSTALLATION_COOKIE, '', { path: '/' });

		logger.info('[github-setup] Redirecting to GitHub OAuth', { redirectUri });
		throw redirect(302, authUrl);
	}

	// Case 3: Direct installation callback — installation_id + setup_action=install
	if (!installationId || setupAction !== 'install') {
		logger.warn('[github-setup] Invalid setup parameters', { installationId, setupAction });
		return { success: false, message: 'Invalid setup parameters' };
	}

	const parsedId = Number(installationId);
	if (isNaN(parsedId) || parsedId <= 0) {
		return { success: false, message: 'Invalid installation ID' };
	}

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
