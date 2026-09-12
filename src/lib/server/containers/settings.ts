import { JsonStore } from './store';
import { ProviderFactory } from './notifications/provider-factory';
import { buildProviderConfig } from './notifications/config';
import { getEnv } from './env';
import type { NotificationChannelType } from '../types';
import type { AppSettings } from '../types';
import type { ProviderConfig } from './notifications/types';

export interface SettingsData {
	to: string;
	from: string;
	multiTo: boolean;
	enabledChannels: NotificationChannelType[];
}

const defaults = (): SettingsData => ({
	to: getEnv('NOTIFY_TO'),
	from: getEnv('NOTIFY_FROM') || getEnv('SMTP_FROM_EMAIL'),
	multiTo: getEnv('NOTIFY_MULTI_TO') === 'true',
	enabledChannels: ['email', 'console']
});

export class SettingsService {
	private readonly store = new JsonStore<SettingsData>('settings.json', defaults());

	get(): SettingsData {
		return this.store.get();
	}

	update(partial: Partial<SettingsData>): SettingsData {
		return this.store.update((draft) => {
			if (partial.to !== undefined) draft.to = partial.to;
			if (partial.from !== undefined) draft.from = partial.from;
			if (partial.multiTo !== undefined) draft.multiTo = partial.multiTo;
			if (partial.enabledChannels !== undefined) draft.enabledChannels = partial.enabledChannels;
		});
	}

	providerConfig(): ProviderConfig {
		return buildProviderConfig(this.store.get());
	}

	appSettings(): AppSettings {
		const data = this.store.get();
		const to = data.to || getEnv('NOTIFY_TO');
		const from = data.from || getEnv('NOTIFY_FROM') || getEnv('SMTP_FROM_EMAIL');
		const multiTo = data.multiTo || getEnv('NOTIFY_MULTI_TO') === 'true' || to.includes(',');
		const config = this.providerConfig();
		const channels = ProviderFactory.availableChannels().map((type) => {
			const provider = ProviderFactory.create(type, config);
			return {
				type,
				label: provider.label,
				description: provider.description,
				configured: provider.isConfigured() && data.enabledChannels.includes(type)
			};
		});
		return {
			to,
			from,
			multiTo,
			channels
		};
	}
}

export const settingsService = new SettingsService();
