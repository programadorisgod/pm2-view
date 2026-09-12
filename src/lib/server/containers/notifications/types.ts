import type { NotificationChannelType } from '../../types';

export type { NotificationChannelType };

export interface NotificationMessage {
	subject: string;
	text: string;
	html?: string;
	to?: string;
}

export interface NotificationMessageMulti {
	subject: string;
	text: string;
	html?: string;
	to?: string | string[];
}

export interface NotificationProvider {
	readonly type: NotificationChannelType;
	readonly label: string;
	readonly description: string;
	isConfigured(): boolean;
	send(message: NotificationMessage): Promise<void>;
}

export interface SmtpConfig {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	pass: string;
	from: string;
	to: string;
	multiTo: boolean;
}

export interface TelegramConfig {
	botToken: string;
	chatId: string;
}

export interface ProviderConfig {
	to: string;
	from: string;
	multiTo: boolean;
	smtp: SmtpConfig;
	telegram: TelegramConfig;
}
