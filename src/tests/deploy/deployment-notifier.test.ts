import { describe, it, expect, vi } from 'vitest';

import {
	createDeploymentNotifier,
	type DeploymentOutcome,
	type DeploymentNotifierDeps
} from '../../../src/lib/deploy/deployment-notifier';
import type { EmailMessage } from '../../../src/lib/notifications';

const DEPLOYMENT = {
	repository: 'owner/project',
	branch: 'main',
	commitSha: 'a'.repeat(40)
};

const PROJECT = {
	id: 'project-1',
	name: 'Project One',
	pm2Name: 'project-one'
};

function makeDeps(overrides: Partial<DeploymentNotifierDeps> = {}): {
	deps: DeploymentNotifierDeps;
	sent: EmailMessage[];
} {
	const sent: EmailMessage[] = [];
	return {
		sent,
		deps: {
			collectRecipients: vi.fn().mockResolvedValue(['owner@example.com']),
			sendEmail: vi.fn().mockImplementation(async (message: EmailMessage) => {
				sent.push(message);
				return true;
			}),
			...overrides
		}
	};
}

describe('DeploymentNotifier', () => {
	it('sends a success email to the project owner email', async () => {
		const { deps, sent } = makeDeps();
		const notifier = createDeploymentNotifier(deps);

		await notifier.notifyResult(DEPLOYMENT, PROJECT, {
			status: 'success',
			commitSha: 'a'.repeat(40),
			durationMs: 6100
		});

		expect(deps.collectRecipients).toHaveBeenCalledWith('project-1');
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual(['owner@example.com']);
		expect(sent[0].subject).toContain('Deploy succeeded');
		expect(sent[0].subject).toContain('project-one');
		expect(sent[0].text).toContain('deployment success');
		expect(sent[0].text).toContain('owner/project@main');
		expect(sent[0].text).toContain('aaaaaaa');
		expect(sent[0].html).toContain('6.1s');
	});

	it('sends a failure email including stage and error', async () => {
		const { deps, sent } = makeDeps();
		const notifier = createDeploymentNotifier(deps);

		await notifier.notifyResult(DEPLOYMENT, PROJECT, {
			status: 'failed',
			stage: 'build',
			error: 'Build failed with exit code 1. Process NOT restarted.',
			durationMs: 3200
		});

		expect(sent).toHaveLength(1);
		expect(sent[0].subject).toContain('Deploy FAILED');
		expect(sent[0].subject).toContain('project-one');
		expect(sent[0].text).toContain('Stage: build');
		expect(sent[0].text).toContain('exit code 1');
		expect(sent[0].html).toContain('#EF4444');
	});

	it('skips sending when no recipient emails are available and does not throw', async () => {
		const { deps } = makeDeps({
			collectRecipients: vi.fn().mockResolvedValue([])
		});
		const notifier = createDeploymentNotifier(deps);

		await expect(
			notifier.notifyResult(DEPLOYMENT, PROJECT, {
				status: 'success',
				commitSha: null,
				durationMs: 10
			})
		).resolves.toBeUndefined();
		expect(deps.sendEmail).not.toHaveBeenCalled();
	});

	it('uses recipients resolved from all access models', async () => {
		const { deps, sent } = makeDeps({
			collectRecipients: vi.fn().mockResolvedValue([
				'owner@example.com',
				'editor@example.com',
				'teamadmin@example.com'
			])
		});
		const notifier = createDeploymentNotifier(deps);

		await notifier.notifyResult(DEPLOYMENT, PROJECT, {
			status: 'success',
			commitSha: 'a'.repeat(40),
			durationMs: 1000
		});

		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual([
			'owner@example.com',
			'editor@example.com',
			'teamadmin@example.com'
		]);
	});

	it('never throws when sendEmail rejects', async () => {
		const { deps } = makeDeps({
			sendEmail: vi.fn().mockRejectedValue(new Error('SMTP connection refused'))
		});
		const notifier = createDeploymentNotifier(deps);

		await expect(
			notifier.notifyResult(DEPLOYMENT, PROJECT, {
				status: 'failed',
				stage: 'git',
				error: 'git fetch failed',
				durationMs: 100
			} satisfies DeploymentOutcome)
		).resolves.toBeUndefined();
	});

	it('escapes HTML in error messages', async () => {
		const { deps, sent } = makeDeps();
		const notifier = createDeploymentNotifier(deps);

		await notifier.notifyResult(DEPLOYMENT, PROJECT, {
			status: 'failed',
			stage: 'install',
			error: '<script>alert("xss")</script>',
			durationMs: 5
		});

		expect(sent[0].html).not.toContain('<script>');
		expect(sent[0].html).toContain('&lt;script&gt;');
	});
});