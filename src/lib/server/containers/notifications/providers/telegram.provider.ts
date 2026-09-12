import type {
	NotificationChannelType,
	NotificationMessage,
	NotificationProvider,
	TelegramConfig
} from '../types';

export class TelegramProvider implements NotificationProvider {
	readonly type: NotificationChannelType = 'telegram';
	readonly label = 'Telegram';
	readonly description = 'Envía las alertas a un chat de Telegram usando el Bot API.';

	constructor(private readonly config: TelegramConfig) {}

	isConfigured(): boolean {
		return Boolean(this.config.botToken && this.config.chatId);
	}

	async send(message: NotificationMessage): Promise<void> {
		if (!this.isConfigured()) {
			throw new Error(
				'TelegramProvider no está configurado: faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.'
			);
		}
		const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: this.config.chatId,
				text: `*${message.subject}*\n\n${message.text}`,
				parse_mode: 'Markdown'
			})
		});
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Telegram respondió ${response.status}: ${body.slice(0, 200)}`);
		}
	}
}
