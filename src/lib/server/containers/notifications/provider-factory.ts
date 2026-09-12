import type { NotificationChannelType, NotificationProvider, ProviderConfig } from './types';
import { EmailProvider } from './providers/email.provider';
import { ConsoleProvider } from './providers/console.provider';
import { TelegramProvider } from './providers/telegram.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';

type ProviderCtor = (config: ProviderConfig) => NotificationProvider;

export class ProviderFactory {
	private static readonly registry: Partial<Record<NotificationChannelType, ProviderCtor>> = {
		email: (config) => new EmailProvider(config.smtp),
		console: () => new ConsoleProvider(),
		telegram: (config) => new TelegramProvider(config.telegram),
		whatsapp: () => new WhatsAppProvider()
	};

	static register(type: NotificationChannelType, ctor: ProviderCtor): void {
		ProviderFactory.registry[type] = ctor;
	}

	static create(type: NotificationChannelType, config: ProviderConfig): NotificationProvider {
		const ctor = ProviderFactory.registry[type];
		if (!ctor) {
			throw new Error(`No hay un proveedor de notificaciones registrado para "${type}".`);
		}
		return ctor(config);
	}

	static availableChannels(): NotificationChannelType[] {
		return Object.keys(ProviderFactory.registry) as NotificationChannelType[];
	}

	static createConfigured(
		types: NotificationChannelType[],
		config: ProviderConfig
	): NotificationProvider[] {
		return types
			.filter((type) => ProviderFactory.registry[type])
			.map((type) => ProviderFactory.create(type, config))
			.filter((provider) => provider.isConfigured());
	}
}
