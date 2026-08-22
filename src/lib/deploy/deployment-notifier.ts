import { env } from '$env/dynamic/private';
import { logger } from '$lib/logger';
import { sendNotificationEmail, type EmailMessage } from '$lib/notifications';
import type { Deployment } from './deployment.types';

export type DeploymentOutcome =
	| { status: 'success'; commitSha: string | null; durationMs: number }
	| { status: 'failed'; stage: string; error: string; durationMs: number };

export interface DeployedProjectInfo {
	id: string;
	name: string;
	pm2Name: string;
	userId: string;
	/** Session email captured when deployment settings were last saved; receives emails alongside the owner. */
	notifyEmail?: string | null;
}

export interface DeploymentNotifierDeps {
	getUserEmail(userId: string): Promise<string | null>;
	sendEmail(message: EmailMessage): Promise<boolean>;
}

export interface DeploymentNotifier {
	notifyResult(
		deployment: Pick<Deployment, 'repository' | 'branch' | 'commitSha'>,
		project: DeployedProjectInfo,
		outcome: DeploymentOutcome
	): Promise<void>;
}

const STATUS_LABEL = {
	success: 'Deploy succeeded',
	failed: 'Deploy FAILED'
} as const;

const ACCENT_COLOR = {
	success: '#22C55E',
	failed: '#EF4444'
} as const;

export function createDeploymentNotifier(deps: DeploymentNotifierDeps): DeploymentNotifier {
	return {
		async notifyResult(deployment, project, outcome) {
			try {
				const ownerEmail = await deps.getUserEmail(project.userId);
				const recipients = dedupeEmails([ownerEmail, project.notifyEmail ?? null]);
				if (recipients.length === 0) {
					logger.warn('Deployment notification skipped: no recipient emails available', {
						projectId: project.id
					});
					return;
				}

				const subject = `[PM2 View] ${STATUS_LABEL[outcome.status]} — ${project.pm2Name} (${deployment.branch})`;
				const message = buildMessage(deployment, project, outcome);

				const sent = await deps.sendEmail({
					from: env.SMTP_FROM_EMAIL ?? '',
					to: recipients,
					subject,
					...message
				});
				if (!sent) {
					logger.warn('Deployment notification not sent: no notification channel configured', {
						projectId: project.id
					});
				} else {
					logger.info('Deployment result notification sent', {
						projectId: project.id,
						to: recipients,
						status: outcome.status
					});
				}
			} catch (err) {
				logger.error('Deployment notification failed', { projectId: project.id, error: err });
			}
		}
	};
}

function buildMessage(
	deployment: Pick<Deployment, 'repository' | 'branch' | 'commitSha'>,
	project: DeployedProjectInfo,
	outcome: DeploymentOutcome
): Pick<EmailMessage, 'text' | 'html'> {
	const duration =
		outcome.durationMs >= 1000
			? `${(outcome.durationMs / 1000).toFixed(1)}s`
			: `${outcome.durationMs}ms`;
	const commit = deployment.commitSha ? deployment.commitSha.slice(0, 7) : '(unknown)';
	const when = new Date().toISOString();

	const rows: [string, string][] = [
		['Status', outcome.status === 'success' ? 'Success' : 'Failed'],
		['Project', project.name],
		['Repository', `${deployment.repository}@${deployment.branch}`],
		['Commit', commit]
	];
	if (outcome.status === 'failed') {
		rows.push(['Stage', outcome.stage], ['Error', outcome.error]);
	}
	rows.push(['Duration', duration], ['Finished at', when]);

	const tableRows = rows
		.map(
			([label, value]) =>
				`<tr><td style="color:#5A6B7B;font-size:13px;padding:6px 0;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="color:#C7D5E0;font-size:13px;padding:6px 0 6px 16px;font-family:monospace;word-break:break-word;">${escapeHtml(value)}</td></tr>`
		)
		.join('');

	const text = [
		`PM2 View deployment ${outcome.status}`,
		`Project: ${project.name} (${project.pm2Name})`,
		`Repository: ${deployment.repository}@${deployment.branch}`,
		`Commit: ${commit}`,
		...(outcome.status === 'failed'
			? [`Stage: ${outcome.stage}`, `Error: ${outcome.error}`]
			: []),
		`Duration: ${duration}`
	].join('\n');

	const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#0B1520;font-family:Arial,sans-serif;">
	<div style="max-width:520px;margin:0 auto;background:#101B29;border:1px solid #1E2D3D;border-radius:12px;padding:32px;">
		<h1 style="color:${ACCENT_COLOR[outcome.status]};font-size:20px;margin:0 0 8px;">${STATUS_LABEL[outcome.status]}</h1>
		<p style="color:#C7D5E0;font-size:14px;line-height:1.6;margin:0 0 24px;">Auto-deployment of <strong>${escapeHtml(project.pm2Name)}</strong> from the GitHub push webhook.</p>
		<table style="width:100%;border-collapse:collapse;">${tableRows}</table>
	</div>
</body>
</html>`;

	return { text, html };
}

function dedupeEmails(emails: (string | null | undefined)[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const email of emails) {
		if (!email) continue;
		const key = email.trim().toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(email.trim());
	}
	return result;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
