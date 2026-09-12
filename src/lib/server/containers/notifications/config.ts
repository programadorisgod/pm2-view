import { getEnv } from '../env';
import type { SettingsData } from '../settings';
import type { NotificationChannelType } from '../../types';
import type { ProviderConfig } from './types';

export function buildProviderConfig(settings: SettingsData): ProviderConfig {
	const to = settings.to || getEnv('NOTIFY_TO');
	const from = settings.from || getEnv('NOTIFY_FROM') || getEnv('SMTP_FROM_EMAIL');
	const multiTo = settings.multiTo || getEnv('NOTIFY_MULTI_TO') === 'true' || to.includes(',');
	return {
		to,
		from,
		multiTo,
		smtp: {
			host: getEnv('SMTP_HOST'),
			port: Number(getEnv('SMTP_PORT', '587')),
			secure: getEnv('SMTP_SECURE') === 'true',
			user: getEnv('SMTP_USER'),
			pass: getEnv('SMTP_PASS'),
			from,
			to,
			multiTo
		},
		telegram: {
			botToken: getEnv('TELEGRAM_BOT_TOKEN'),
			chatId: getEnv('TELEGRAM_CHAT_ID')
		}
	};
}

export const channelLabels: Record<NotificationChannelType, string> = {
	email: 'Email (SMTP)',
	console: 'Consola',
	telegram: 'Telegram',
	whatsapp: 'WhatsApp'
};
