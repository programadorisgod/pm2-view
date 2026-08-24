import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { GitHubSetupService } from '$lib/github/github-setup.service';
import { logger } from '$lib/logger';
import { getEnv } from '$lib/db/env';

const OAUTH_STATE_COOKIE = 'github_oauth_state';

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

	const installationRepo = new GitHubInstallationRepository();
	const appClient = new GitHubAppClient();
	const setupService = new GitHubSetupService(installationRepo, appClient);

	// ============================================
	// FLOJO A: GitHub App installation completed
	// GitHub redirige con installation_id + setup_action=install
	// ============================================
	if (installationId && setupAction === 'install') {
		const parsedId = Number(installationId);
		if (isNaN(parsedId) || parsedId <= 0) {
			return { success: false, message: 'Invalid installation ID' };
		}

		try {
			logger.info('[github-setup] Installation completed, saving', { userId: user.id, installationId: parsedId });
			await setupService.handleSetupCallback(user.id, parsedId);
			return { success: true, message: 'GitHub connected successfully' };
		} catch (err: any) {
			logger.error('[github-setup] Installation callback failed', { error: err.message });
			if (err.status) throw err;
			return { success: false, message: err.message || 'Failed to complete installation' };
		}
	}

	// ============================================
	// FLOJO B: OAuth durante instalación (setup_action=request + code)
	// GitHub ya autorizó OAuth, ahora hay que redirigir a la instalación
	// ============================================
	if (setupAction === 'request' && code) {
		// El usuario ya autorizó OAuth. Solo hay que redirigirlo a instalar la app.
		// Después de instalar, GitHub vuelve con installation_id + setup_action=install (Flujo A)
		logger.info('[github-setup] OAuth authorized during install, redirecting to installation');
		throw redirect(302, appClient.getInstallUrl());
	}

	// ============================================
	// FLOJO C: Callback de OAuth normal (code + state)
	// ============================================
	if (code && state) {
		const savedState = cookies.get(OAUTH_STATE_COOKIE);
		cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });

		if (state !== savedState) {
			logger.warn('[github-setup] OAuth state mismatch', { savedState: !!savedState, incomingState: !!state });
			return { success: false, message: 'Invalid OAuth state' };
		}

		try {
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

			// Buscar instalaciones del usuario
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
				return {
					success: false,
					message: 'GitHub authorized. Please install the GitHub App to complete setup.',
					installUrl: appClient.getInstallUrl()
				};
			}

			const targetInstallationId = installations[0].id;
			logger.info('[github-setup] OAuth completed, saving installation', {
				userId: user.id,
				installationId: targetInstallationId
			});

			await setupService.handleSetupCallback(user.id, targetInstallationId);
			return { success: true, message: 'GitHub connected successfully' };
		} catch (err: any) {
			logger.error('[github-setup] OAuth callback failed', { error: err.message });
			if (err.status) throw err;
			return { success: false, message: err.message || 'Failed to complete GitHub setup' };
		}
	}

	// ============================================
	// FLOJO D: Iniciar conexión - el usuario quiere conectar GitHub
	// Redirigir a OAuth para autorizar
	// ============================================
	const oauthState = crypto.randomUUID();
	const clientId = appClient.clientId;
	const origin = url.origin;
	const basePath = getEnv().APP_BASE_PATH ?? '';
	const redirectUri = `${origin}${basePath}/github/setup`;
	const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read%3Auser&state=${oauthState}`;

	cookies.set(OAUTH_STATE_COOKIE, oauthState, { path: '/' });
	logger.info('[github-setup] Starting OAuth flow', { redirectUri });
	throw redirect(302, authUrl);
};
