import { env } from '$env/dynamic/private';
import { getNotificationProviders } from '$lib/notifications';
import { logger } from '$lib/logger';
import type { OtpPayload } from './types';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

const store = new Map<string, OtpPayload>();

// Periodic cleanup of expired tokens
setInterval(() => {
	const now = Date.now();
	for (const [key, payload] of store) {
		if (now > payload.expiresAt) store.delete(key);
	}
}, 60_000);

export class PortOtpService {
	generate(userId: string, port: number, pid: number | null, processName: string | null): string {
		const code = this.randomCode();
		const payload: OtpPayload = {
			code,
			userId,
			port,
			pid,
			processName,
			expiresAt: Date.now() + OTP_TTL_MS
		};

		store.set(userId, payload);
		return code;
	}

	verify(userId: string, code: string): OtpPayload | null {
		const payload = store.get(userId);
		if (!payload) return null;

		if (Date.now() > payload.expiresAt) {
			store.delete(userId);
			return null;
		}

		if (payload.code !== code) return null;

		// Consume the OTP (single use)
		store.delete(userId);
		return payload;
	}

	async sendCode(
		email: string,
		code: string,
		port: number,
		processName: string | null
	): Promise<boolean> {
		const subject = `[PM2 View] Verification code: ${code}`;
		const procLabel = processName ? ` (${processName})` : '';
		const from = env.SMTP_FROM_EMAIL || env.SMTP_USER || '';

		if (!from) {
			logger.error('OTP email failed: no SMTP_FROM_EMAIL or SMTP_USER configured');
			return false;
		}

		const text = [
			'PM2 View — Port Kill Verification',
			``,
			`Your verification code: ${code}`,
			``,
			`Port: ${port}${procLabel}`,
			`This code expires in 5 minutes.`,
			``,
			`If you didn't request this, ignore this email.`
		].join('\n');

		const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#0B1520;font-family:Arial,sans-serif;">
	<div style="max-width:480px;margin:0 auto;background:#101B29;border:1px solid #1E2D3D;border-radius:12px;padding:32px;">
		<h1 style="color:#EDEDED;font-size:20px;margin:0 0 8px;">Verification Code</h1>
		<p style="color:#C7D5E0;font-size:14px;line-height:1.6;margin:0 0 24px;">
			You requested to free port <strong>${port}</strong>${processName ? ` (${escapeHtml(processName)})` : ''}.
		</p>
		<div style="background:#1A2533;border:1px solid #2A3A4A;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px;">
			<p style="color:#888888;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Your code</p>
			<p style="color:#0070F3;font-size:36px;font-weight:bold;margin:0;font-family:monospace;letter-spacing:6px;">${code}</p>
		</div>
		<p style="color:#666666;font-size:12px;line-height:1.6;margin:0;">
			This code expires in 5 minutes. If you didn't request this, ignore this email.
		</p>
	</div>
</body>
</html>`;

		try {
			const providers = getNotificationProviders();
			if (providers.length === 0) {
				logger.error('OTP email failed: no notification providers configured');
				return false;
			}

			const message = { from, to: email, subject, text, html };
			for (const provider of providers) {
				try {
					await provider.sendEmail(message);
					logger.info('OTP email sent', { provider: provider.name, email, port });
				} catch (error) {
					logger.error(`OTP email failed via ${provider.name}`, {
						error: String(error),
						email,
						port
					});
					return false;
				}
			}
			return true;
		} catch (error) {
			logger.error('Failed to send OTP email', { error: String(error), email, port });
			return false;
		}
	}

	private randomCode(): string {
		// 6-digit code, zero-padded
		return String(Math.floor(100000 + Math.random() * 900000));
	}
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
