import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createProcessAlertNotifier,
	buildMessage,
	type ProcessAlertDeps,
	type ProcessAlertProject
} from '../../../src/lib/notifications/process-alert-notifier';
import type { EmailMessage } from '../../../src/lib/notifications';

const PROJECT: ProcessAlertProject = {
	id: 'project-1',
	name: 'Project One',
	pm2Name: 'project-one',
	userId: 'user-1',
	notifyEmail: null,
	teamId: null
};

function makeDeps(overrides: Partial<ProcessAlertDeps> = {}): {
	deps: ProcessAlertDeps;
	sent: EmailMessage[];
} {
	const sent: EmailMessage[] = [];
	return {
		sent,
		deps: {
			findProjectByPm2Name: vi.fn().mockResolvedValue(PROJECT),
			getUserEmail: vi.fn().mockResolvedValue('owner@example.com'),
			getTeamMemberEmails: vi.fn().mockResolvedValue([]),
			sendEmail: vi.fn().mockImplementation(async (message: EmailMessage) => {
				sent.push(message);
				return true;
			}),
			cooldownMs: 0,
			...overrides
		}
	};
}

describe('ProcessAlertNotifier', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	it('sends an error email to the project owner', async () => {
		const { deps, sent } = makeDeps();
		const notifier = createProcessAlertNotifier(deps);

		await notifier.notifyProcessError('project-one', 'online');

		expect(deps.findProjectByPm2Name).toHaveBeenCalledWith('project-one');
		expect(deps.getUserEmail).toHaveBeenCalledWith('user-1');
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual(['owner@example.com']);
		expect(sent[0].subject).toContain('Process ERRORED');
		expect(sent[0].subject).toContain('project-one');
		expect(sent[0].text).toContain('Process: project-one');
		expect(sent[0].text).toContain('Previous status: online');
	});

	it('includes notifyEmail in recipients when present', async () => {
		const { deps, sent } = makeDeps();
		const notifier = createProcessAlertNotifier(deps);

		await notifier.notifyProcessError('project-one', 'online');

		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual(['owner@example.com']);
	});

	it('sends to owner + notifyEmail when they differ', async () => {
		const { deps, sent } = makeDeps();
		const notifier = createProcessAlertNotifier(deps);

		await notifier.notifyProcessError('project-one', 'online');

		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual(['owner@example.com']);
	});

	it('includes team member emails when project has a team', async () => {
		const projectWithTeam = { ...PROJECT, teamId: 'team-1' };
		const { deps, sent } = makeDeps({
			findProjectByPm2Name: vi.fn().mockResolvedValue(projectWithTeam),
			getTeamMemberEmails: vi.fn().mockResolvedValue([
				'team1@example.com',
				'team2@example.com'
			])
		});
		const notifier = createProcessAlertNotifier(deps);

		await notifier.notifyProcessError('project-one', 'online');

		expect(deps.getTeamMemberEmails).toHaveBeenCalledWith('team-1');
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toContain('owner@example.com');
		expect(sent[0].to).toContain('team1@example.com');
		expect(sent[0].to).toContain('team2@example.com');
	});

	it('deduplicates emails case-insensitively', async () => {
		const projectWithTeam = { ...PROJECT, teamId: 'team-1' };
		const { deps, sent } = makeDeps({
			findProjectByPm2Name: vi.fn().mockResolvedValue(projectWithTeam),
			getTeamMemberEmails: vi.fn().mockResolvedValue([
				'  Owner@Example.com  ',
				'other@example.com'
			])
		});
		const notifier = createProcessAlertNotifier(deps);

		await notifier.notifyProcessError('project-one', 'online');

		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual(['owner@example.com', 'other@example.com']);
	});

	it('skips sending when project is not registered', async () => {
		const { deps } = makeDeps({
			findProjectByPm2Name: vi.fn().mockResolvedValue(null)
		});
		const notifier = createProcessAlertNotifier(deps);

		await expect(
			notifier.notifyProcessError('unknown-process', 'online')
		).resolves.toBeUndefined();
		expect(deps.sendEmail).not.toHaveBeenCalled();
	});

	it('skips sending when no recipient emails are available', async () => {
		const { deps } = makeDeps({
			getUserEmail: vi.fn().mockResolvedValue(null)
		});
		const notifier = createProcessAlertNotifier(deps);

		await expect(
			notifier.notifyProcessError('project-one', 'online')
		).resolves.toBeUndefined();
		expect(deps.sendEmail).not.toHaveBeenCalled();
	});

	it('never throws when sendEmail rejects', async () => {
		const { deps } = makeDeps({
			sendEmail: vi.fn().mockRejectedValue(new Error('SMTP connection refused'))
		});
		const notifier = createProcessAlertNotifier(deps);

		await expect(
			notifier.notifyProcessError('project-one', 'online')
		).resolves.toBeUndefined();
	});

	it('respects cooldown between alerts for the same process', async () => {
		const { deps, sent } = makeDeps({ cooldownMs: 300000 });
		const notifier = createProcessAlertNotifier(deps);

		await notifier.notifyProcessError('project-one', 'online');
		expect(sent).toHaveLength(1);

		await notifier.notifyProcessError('project-one', 'online');
		expect(sent).toHaveLength(1);

		vi.advanceTimersByTime(300001);

		await notifier.notifyProcessError('project-one', 'online');
		expect(sent).toHaveLength(2);
	});

	it('allows alerts for different processes independently', async () => {
		const { deps, sent } = makeDeps({ cooldownMs: 300000 });
		const notifier = createProcessAlertNotifier(deps);

		await notifier.notifyProcessError('project-one', 'online');
		expect(sent).toHaveLength(1);

		await notifier.notifyProcessError('other-project', 'stopped');
		expect(sent).toHaveLength(2);
	});

	it('handles error transition from stopped status', async () => {
		const { deps, sent } = makeDeps();
		const notifier = createProcessAlertNotifier(deps);

		await notifier.notifyProcessError('project-one', 'stopped');

		expect(sent).toHaveLength(1);
		expect(sent[0].text).toContain('Previous status: stopped');
	});

	it('never throws when findProjectByPm2Name rejects', async () => {
		const { deps } = makeDeps({
			findProjectByPm2Name: vi.fn().mockRejectedValue(new Error('DB connection lost'))
		});
		const notifier = createProcessAlertNotifier(deps);

		await expect(
			notifier.notifyProcessError('project-one', 'online')
		).resolves.toBeUndefined();
	});

	it('never throws when getUserEmail rejects', async () => {
		const { deps } = makeDeps({
			getUserEmail: vi.fn().mockRejectedValue(new Error('DB timeout'))
		});
		const notifier = createProcessAlertNotifier(deps);

		await expect(
			notifier.notifyProcessError('project-one', 'online')
		).resolves.toBeUndefined();
	});

	it('never throws when getTeamMemberEmails rejects', async () => {
		const { deps } = makeDeps({
			getTeamMemberEmails: vi.fn().mockRejectedValue(new Error('DB timeout'))
		});
		const notifier = createProcessAlertNotifier(deps);

		await expect(
			notifier.notifyProcessError('project-one', 'online')
		).resolves.toBeUndefined();
	});
});

describe('buildMessage', () => {
	it('generates text with process name and previous status', () => {
		const { text } = buildMessage('my-app', 'online');
		expect(text).toContain('Process: my-app');
		expect(text).toContain('Previous status: online');
		expect(text).toContain('Current status: errored');
	});

	it('generates HTML with dark theme styling', () => {
		const { html } = buildMessage('my-app', 'online');
		expect(html).toContain('#EF4444');
		expect(html).toContain('#0B1520');
		expect(html).toContain('Process ERRORED');
		expect(html).toContain('my-app');
	});

	it('escapes HTML in process name', () => {
		const { html } = buildMessage('<script>alert("xss")</script>', 'online');
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('escapes HTML in previous status', () => {
		const { html } = buildMessage('app', '<img onerror="xss">');
		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;img');
	});
});
