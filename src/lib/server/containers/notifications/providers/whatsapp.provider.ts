import type { NotificationChannelType, NotificationMessage, NotificationProvider } from '../types';

export class WhatsAppProvider implements NotificationProvider {
	readonly type: NotificationChannelType = 'whatsapp';
	readonly label = 'WhatsApp';
	readonly description =
		'Placeholder para un futuro canal por WhatsApp (p. ej. WhatsApp Business API).';

	isConfigured(): boolean {
		return false;
	}

	async send(_message: NotificationMessage): Promise<void> {
		void _message;
		throw new Error('El canal de WhatsApp aún no está implementado.');
	}
}
