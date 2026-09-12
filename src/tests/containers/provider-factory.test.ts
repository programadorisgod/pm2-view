import { describe, expect, it } from 'vitest';
import { ProviderFactory } from '$lib/server/containers/notifications/provider-factory';
import { buildProviderConfig } from '$lib/server/containers/notifications/config';
import type { ProviderConfig } from '$lib/server/containers/notifications/types';
import type { SettingsData } from '$lib/server/containers/settings';

function emptyConfig(): ProviderConfig {
	return buildProviderConfig({
		to: '',
		from: '',
		multiTo: false,
		enabledChannels: []
	} satisfies SettingsData);
}

describe('ProviderFactory', () => {
	it('crea un proveedor de consola listo para usar sin configuración externa', () => {
		const provider = ProviderFactory.create('console', emptyConfig());
		expect(provider.label).toBe('Consola');
		expect(provider.isConfigured()).toBe(true);
	});

	it('marca email y telegram como no configurados cuando faltan credenciales', () => {
		const config = emptyConfig();
		expect(ProviderFactory.create('email', config).isConfigured()).toBe(false);
		expect(ProviderFactory.create('telegram', config).isConfigured()).toBe(false);
	});

	it('expone todos los canales soportados', () => {
		expect(ProviderFactory.availableChannels().sort()).toEqual([
			'console',
			'email',
			'telegram',
			'whatsapp'
		]);
	});

	it('filtra solo los canales que están habilitados y configurados', () => {
		const config = emptyConfig();
		const providers = ProviderFactory.createConfigured(['console', 'email', 'whatsapp'], config);
		expect(providers.map((p) => p.label)).toEqual(['Consola']);
	});
});
