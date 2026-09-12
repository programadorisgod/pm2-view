import { describe, it, expect } from 'vitest';
import { getEnv } from '$lib/server/containers/env';
import { settingsService } from '$lib/server/containers/settings';
import { buildProviderConfig } from '$lib/server/containers/notifications/config';

describe('Containers environment resolution', () => {
	it('resolves environment variables with fallback', () => {
		process.env.TEST_CONTAINER_VAR = 'custom-val';
		expect(getEnv('TEST_CONTAINER_VAR')).toBe('custom-val');
		expect(getEnv('NON_EXISTENT_VAR', 'fallback')).toBe('fallback');
	});

	it('reads notification settings through getEnv', () => {
		process.env.NOTIFY_TO = 'test@example.com';
		process.env.NOTIFY_FROM = 'admin@example.com';
		process.env.NOTIFY_MULTI_TO = 'true';

		const settings = settingsService.appSettings();
		expect(settings.to).toBe('test@example.com');
		expect(settings.from).toBe('admin@example.com');
		expect(settings.multiTo).toBe(true);

		const providerConfig = buildProviderConfig({
			to: '',
			from: '',
			multiTo: false,
			enabledChannels: ['email']
		});
		expect(providerConfig.to).toBe('test@example.com');
		expect(providerConfig.from).toBe('admin@example.com');
		expect(providerConfig.multiTo).toBe(true);
	});
});
