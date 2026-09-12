import type { NotificationChannelType, NotificationMessage, NotificationProvider } from '../types';

export class ConsoleProvider implements NotificationProvider {
	readonly type: NotificationChannelType = 'console';
	readonly label = 'Consola';
	readonly description =
		'Registra la notificación en los logs del servidor (ideal para desarrollo).';

	isConfigured(): boolean {
		return true;
	}

	async send(message: NotificationMessage): Promise<void> {
		console.log(`[notification:console] ${message.subject}\n${message.text}`);
	}
}
