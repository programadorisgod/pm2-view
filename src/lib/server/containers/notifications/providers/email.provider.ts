import nodemailer from 'nodemailer';
import type {
	NotificationChannelType,
	NotificationMessage,
	NotificationProvider,
	SmtpConfig
} from '../types';

export class EmailProvider implements NotificationProvider {
	readonly type: NotificationChannelType = 'email';
	readonly label = 'Email (SMTP)';
	readonly description = 'Envía las alertas por correo electrónico usando nodemailer.';

	constructor(private readonly config: SmtpConfig) {}

	isConfigured(): boolean {
		return Boolean(this.config.host && this.config.port && (this.config.to || this.config.from));
	}

	async send(message: NotificationMessage): Promise<void> {
		if (!this.isConfigured()) {
			throw new Error(
				'EmailProvider no está configurado: faltan SMTP_HOST, SMTP_PORT o destinatario.'
			);
		}
		const transporter = nodemailer.createTransport({
			host: this.config.host,
			port: this.config.port,
			secure: this.config.secure,
			auth: this.config.user ? { user: this.config.user, pass: this.config.pass } : undefined
		});

		let recipients: string | string[] = message.to ?? this.config.to;
		if (this.config.multiTo && typeof recipients === 'string') {
			recipients = recipients
				.split(',')
				.map((e) => e.trim())
				.filter(Boolean);
		}

		await transporter.sendMail({
			from: this.config.from || message.to,
			to: recipients,
			subject: message.subject,
			text: message.text,
			html: message.html
		});
	}
}
