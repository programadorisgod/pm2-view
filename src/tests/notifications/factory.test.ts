import { describe, it, expect } from 'vitest';
import { createNotificationProvider, registerNotificationProvider } from '../../lib/notifications/factory';
import { getNotificationProviders } from '../../lib/notifications';
import type { EmailMessage, NotificationProvider } from '../../lib/notifications/provider.interface';

describe('Notification Provider Factory', () => {
	it('should return null for nodemailer when SMTP is not configured', () => {
		expect(createNotificationProvider('nodemailer')).toBeNull();
	});

	it('should throw for unknown provider', () => {
		expect(() => createNotificationProvider('unknown')).toThrow(/Unknown notification provider/);
	});

	it('should register and create a custom provider', () => {
		const mockProvider: NotificationProvider = {
			name: 'mock',
			sendEmail: async () => {}
		};
		registerNotificationProvider('mock', () => mockProvider);
		expect(createNotificationProvider('mock')).toBe(mockProvider);
	});

	it('should return empty list when no channel is configured', () => {
		expect(getNotificationProviders()).toEqual([]);
	});

	it('should build EmailMessage with correct structure', () => {
		const message: EmailMessage = {
			from: 'PM2 View <no-reply@example.com>',
			to: 'user@example.com',
			subject: 'Reset your password',
			text: 'Reset link'
		};
		expect(message.from).toContain('no-reply@example.com');
		expect(message.to).toBe('user@example.com');
		expect(message.subject).toBe('Reset your password');
	});
});
