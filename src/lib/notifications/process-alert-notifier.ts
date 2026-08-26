import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import { sendNotificationEmail, type EmailMessage } from './index';
import { db } from '$lib/db/db';
import { projects, users, teamMembers } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

const COOLDOWN_MS = 5 * 60 * 1000;

export interface ProcessAlertProject {
	id: string;
	name: string;
	pm2Name: string;
	userId: string;
	notifyEmail: string | null;
	teamId: string | null;
}

export interface ProcessAlertDeps {
	findProjectByPm2Name(pm2Name: string): Promise<ProcessAlertProject | null>;
	getUserEmail(userId: string): Promise<string | null>;
	getTeamMemberEmails(teamId: string): Promise<string[]>;
	sendEmail(message: EmailMessage): Promise<boolean>;
	cooldownMs?: number;
}

export interface ProcessAlertNotifier {
	notifyProcessError(processName: string, previousStatus: string): Promise<void>;
}

export function createProcessAlertNotifier(deps: ProcessAlertDeps): ProcessAlertNotifier {
	const cooldownMs = deps.cooldownMs ?? COOLDOWN_MS;
	const cooldowns = new Map<string, number>();

	return {
		async notifyProcessError(processName, previousStatus) {
			const now = Date.now();
			const lastAlert = cooldowns.get(processName);
			if (lastAlert && now - lastAlert < cooldownMs) {
				return;
			}

			try {
				const project = await deps.findProjectByPm2Name(processName);
				if (!project) {
					logger.debug('Process error alert skipped: no registered project', { processName });
					return;
				}

				const recipientEmails = await collectRecipients(deps, project);
				if (recipientEmails.length === 0) {
					logger.warn('Process error alert skipped: no recipient emails', { processName });
					return;
				}

				const subject = `[PM2 View] Process ERRORED — ${processName}`;
				const message = buildMessage(processName, previousStatus);

				const sent = await deps.sendEmail({
					from: env.SMTP_FROM_EMAIL ?? '',
					to: recipientEmails,
					subject,
					...message
				});

				if (!sent) {
					logger.warn('Process error alert not sent: no notification channel configured', {
						processName
					});
					return;
				}

				cooldowns.set(processName, now);
				logger.info('Process error alert sent', {
					processName,
					to: recipientEmails,
					previousStatus
				});
			} catch (err) {
				logger.error('Process error alert failed', { processName, error: String(err) });
			}
		}
	};
}

async function collectRecipients(
	deps: ProcessAlertDeps,
	project: ProcessAlertProject
): Promise<string[]> {
	const emails = new Set<string>();

	const ownerEmail = await deps.getUserEmail(project.userId);
	if (ownerEmail) {
		emails.add(ownerEmail.trim().toLowerCase());
	}

	if (project.notifyEmail) {
		const normalized = project.notifyEmail.trim().toLowerCase();
		if (normalized) emails.add(normalized);
	}

	if (project.teamId) {
		const teamEmails = await deps.getTeamMemberEmails(project.teamId);
		for (const email of teamEmails) {
			const normalized = email.trim().toLowerCase();
			if (normalized) emails.add(normalized);
		}
	}

	return [...emails];
}

export function buildMessage(
	processName: string,
	previousStatus: string
): Pick<EmailMessage, 'text' | 'html'> {
	const when = new Date().toISOString();

	const rows: [string, string][] = [
		['Process', processName],
		['Previous Status', previousStatus],
		['Current Status', 'errored'],
		['Detected at', when]
	];

	const tableRows = rows
		.map(
			([label, value]) =>
				`<tr><td style="color:#5A6B7B;font-size:13px;padding:6px 0;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="color:#C7D5E0;font-size:13px;padding:6px 0 6px 16px;font-family:monospace;word-break:break-word;">${escapeHtml(value)}</td></tr>`
		)
		.join('');

	const text = [
		`PM2 View process error alert`,
		`Process: ${processName}`,
		`Previous status: ${previousStatus}`,
		`Current status: errored`,
		`Detected at: ${when}`
	].join('\n');

	const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#0B1520;font-family:Arial,sans-serif;">
	<div style="max-width:520px;margin:0 auto;background:#101B29;border:1px solid #1E2D3D;border-radius:12px;padding:32px;">
		<h1 style="color:#EF4444;font-size:20px;margin:0 0 8px;">Process ERRORED</h1>
		<p style="color:#C7D5E0;font-size:14px;line-height:1.6;margin:0 0 24px;">The process <strong>${escapeHtml(processName)}</strong> has entered an error state.</p>
		<table style="width:100%;border-collapse:collapse;">${tableRows}</table>
	</div>
</body>
</html>`;

	return { text, html };
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/** Factory default deps that use the real DB and notification system */
export function createDefaultProcessAlertNotifier(): ProcessAlertNotifier {
	return createProcessAlertNotifier({
		async findProjectByPm2Name(pm2Name) {
			const project = await db.query.projects.findFirst({
				where: eq(projects.pm2Name, pm2Name)
			});
			return project ?? null;
		},
		async getUserEmail(userId) {
			const user = await db.query.users.findFirst({
				where: eq(users.id, userId),
				columns: { email: true }
			});
			return user?.email ?? null;
		},
		async getTeamMemberEmails(teamId) {
			const members = await db.query.teamMembers.findMany({
				where: eq(teamMembers.teamId, teamId),
				with: {
					user: {
						columns: { email: true }
					}
				}
			});
			return members
				.map((m) => m.user?.email)
				.filter((email): email is string => !!email);
		},
		sendEmail: sendNotificationEmail
	});
}
