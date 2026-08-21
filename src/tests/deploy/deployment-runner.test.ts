import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DeploymentRunner } from '../../../src/lib/deploy/deployment-runner';
import { DeploymentWorker } from '../../../src/lib/deploy/deployment-worker';
import { GitCommandError } from '../../../src/lib/deploy/git.service';
import type {
	IDeploymentRepository,
	Deployment
} from '../../../src/lib/deploy/deployment.types';
import type { GitService } from '../../../src/lib/deploy/git.service';
import type { PM2Process } from '../../../src/lib/pm2/pm2.types';
import type { Project } from '../../../src/lib/projects/project.types';

function makeDeploymentRepo(): IDeploymentRepository & {
	mocks: Record<string, ReturnType<typeof vi.fn>>;
} {
	const mocks = {
		getById: vi.fn(),
		getByDeliveryId: vi.fn(),
		getByProjectId: vi.fn(),
		getLatestByProjectId: vi.fn(),
		create: vi.fn(),
		markRunning: vi.fn().mockResolvedValue(undefined),
		markSuccess: vi.fn().mockResolvedValue(undefined),
		markFailed: vi.fn().mockResolvedValue(undefined),
		appendLog: vi.fn().mockResolvedValue(undefined),
		setLogs: vi.fn().mockResolvedValue(undefined),
		setCommitSha: vi.fn().mockResolvedValue(undefined),
		failStaleRunning: vi.fn().mockResolvedValue(0),
		findNextPending: vi.fn(),
		hasRunningForProject: vi.fn().mockResolvedValue(false)
	};
	return { ...mocks, mocks };
}

function makeGitService(overrides: Partial<Record<string, unknown>> = {}): GitService {
	const base: Record<string, unknown> = {
		fetchOrigin: vi.fn().mockResolvedValue(undefined),
		currentBranch: vi.fn().mockResolvedValue('main'),
		checkoutBranch: vi.fn().mockResolvedValue(undefined),
		pullFFOnly: vi.fn().mockResolvedValue(undefined),
		headSha: vi.fn().mockResolvedValue('b'.repeat(40)),
		hasLocalChanges: vi.fn().mockResolvedValue(false)
	};
	Object.assign(base, overrides);
	return base as unknown as GitService;
}

function makePm2Process(status: string): PM2Process {
	return {
		name: 'project-one',
		pm_id: 0,
		monit: { cpu: 0, memory: 0 },
		pm2_env: { status, pm_uptime: 0, restart_time: 0 }
	};
}

const TEST_PROJECT: Project = {
	id: 'project-1',
	userId: 'user-1',
	teamId: null,
	name: 'Project One',
	pm2Name: 'project-one',
	description: null,
	targetPath: null,
	githubRepo: 'owner/project',
	deployBranch: 'main',
	autoDeployEnabled: true,
	createdAt: new Date()
};

function makeDeployment(): Deployment {
	return {
		id: 'dep-1',
		projectId: 'project-1',
		repository: 'owner/project',
		branch: 'main',
		commitSha: 'a'.repeat(40),
		deliveryId: 'delivery-1',
		status: 'pending',
		stage: null,
		error: null,
		logs: '',
		startedAt: null,
		finishedAt: null,
		durationMs: null,
		createdAt: new Date()
	};
}

describe('DeploymentRunner', () => {
	let workingDir: string;

	beforeEach(() => {
		vi.clearAllMocks();
		workingDir = mkdtempSync(join(tmpdir(), 'deploy-runner-test-'));
	});

	afterEach(() => {
		rmSync(workingDir, { recursive: true, force: true });
	});

	function makeRunnerDeps(
		gitOverrides: Partial<Record<string, unknown>> = {},
		pm2Statuses: string[] = ['online'],
		configCommands: Record<'install' | 'build', string[]> = {
			install: ['node', '-e', 'process.exit(0)'],
			build: ['node', '-e', 'process.exit(0)']
		}
	) {
		let describeCalls = 0;
		return {
			deploymentRepo: makeDeploymentRepo(),
			gitService: makeGitService(gitOverrides),
			pm2Repo: {
				describe: vi.fn().mockImplementation(async () => {
					const status = pm2Statuses[Math.min(describeCalls++, pm2Statuses.length - 1)];
					return status === null ? null : makePm2Process(status);
				})
			} as any,
			deployConfigRepo: {
				getByType: vi.fn().mockImplementation(async (_pid: string, type: string) => {
					if (type === 'install') return [{ command: configCommands.install.join(' '), sortOrder: 0 }];
					if (type === 'build') return [{ command: configCommands.build.join(' '), sortOrder: 0 }];
					return [];
				})
			},
			runPm2Restart: vi.fn().mockResolvedValue(0),
			gitAuth: { getToken: vi.fn().mockResolvedValue(null) },
			verifyAttempts: 3,
			verifyDelayMs: 1
		};
	}

	it('8. completes a successful deployment end-to-end', async () => {
		const deps = makeRunnerDeps();
		const project = { ...TEST_PROJECT, targetPath: workingDir };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.deploymentRepo.mocks.markRunning).toHaveBeenCalledWith('dep-1', expect.any(Date));
		expect(deps.gitService.fetchOrigin).toHaveBeenCalled();
		expect(deps.gitService.checkoutBranch).toHaveBeenCalledWith(workingDir, 'main', expect.any(Function));
		expect(deps.gitService.pullFFOnly).toHaveBeenCalled();
		expect(deps.deploymentRepo.mocks.setCommitSha).toHaveBeenCalledWith('dep-1', 'b'.repeat(40));
		expect(deps.runPm2Restart).toHaveBeenCalledWith(
			'project-one',
			workingDir,
			expect.any(Object),
			expect.any(Function)
		);
		expect(deps.deploymentRepo.mocks.markSuccess).toHaveBeenCalledWith(
			'dep-1',
			expect.any(Date),
			expect.any(Number)
		);
		expect(deps.deploymentRepo.mocks.markFailed).not.toHaveBeenCalled();
	});

	it('8b. passes minted git credentials to network operations', async () => {
		const deps = makeRunnerDeps();
		(deps.gitAuth.getToken as ReturnType<typeof vi.fn>).mockResolvedValue('ghs_test_token');
		const project = { ...TEST_PROJECT, targetPath: workingDir };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.gitAuth.getToken).toHaveBeenCalledWith('owner/project');
		expect(deps.gitService.fetchOrigin).toHaveBeenCalledWith(
			workingDir,
			expect.any(Function),
			'ghs_test_token'
		);
		expect(deps.gitService.pullFFOnly).toHaveBeenCalledWith(
			workingDir,
			expect.any(Function),
			'ghs_test_token'
		);
	});

	it('9. fails at git stage when fetch throws, without restarting PM2', async () => {
		const deps = makeRunnerDeps({
			fetchOrigin: vi.fn().mockRejectedValue(new GitCommandError('git fetch failed with exit code 128', []))
		});
		const project = { ...TEST_PROJECT, targetPath: workingDir };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.deploymentRepo.mocks.markFailed).toHaveBeenCalledWith(
			'dep-1',
			'git',
			expect.stringContaining('fetch failed'),
			expect.any(Date),
			expect.any(Number)
		);
		expect(deps.runPm2Restart).not.toHaveBeenCalled();
	});

	it('10. fails at install stage when the install command exits non-zero, without restarting PM2', async () => {
		const deps = makeRunnerDeps({}, ['online'], {
			install: ['node', '-e', 'process.exit(1)'],
			build: ['node', '-e', 'process.exit(0)']
		});
		const project = { ...TEST_PROJECT, targetPath: workingDir };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.deploymentRepo.mocks.markFailed).toHaveBeenCalledWith(
			'dep-1',
			'install',
			expect.stringContaining('exit code 1'),
			expect.any(Date),
			expect.any(Number)
		);
		expect(deps.runPm2Restart).not.toHaveBeenCalled();
	});

	it('11. fails at build stage when the build command exits non-zero', async () => {
		const deps = makeRunnerDeps({}, ['online'], {
			install: ['node', '-e', 'process.exit(0)'],
			build: ['node', '-e', 'process.exit(1)']
		});
		const project = { ...TEST_PROJECT, targetPath: workingDir };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.deploymentRepo.mocks.markFailed).toHaveBeenCalledWith(
			'dep-1',
			'build',
			expect.stringContaining('exit code 1'),
			expect.any(Date),
			expect.any(Number)
		);
	});

	it('14. does NOT restart PM2 when the build fails (logs preserved)', async () => {
		const deps = makeRunnerDeps({}, ['online'], {
			install: ['node', '-e', 'process.exit(0)'],
			build: ['node', '-e', 'process.exit(1)']
		});
		const project = { ...TEST_PROJECT, targetPath: workingDir };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.runPm2Restart).not.toHaveBeenCalled();
		expect(deps.pm2Repo.describe).not.toHaveBeenCalled();
		expect(deps.deploymentRepo.mocks.setLogs).toHaveBeenCalled();
		const persistedLogs = deps.deploymentRepo.mocks.setLogs.mock.calls.at(-1)?.[1] ?? '';
		expect(persistedLogs).toContain('[build]');
	});

	it('12. fails at pm2 stage when the restart command exits non-zero', async () => {
		const deps = makeRunnerDeps();
		deps.runPm2Restart = vi.fn().mockResolvedValue(1);
		const project = { ...TEST_PROJECT, targetPath: workingDir };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.deploymentRepo.mocks.markFailed).toHaveBeenCalledWith(
			'dep-1',
			'pm2',
			expect.stringContaining('restart failed'),
			expect.any(Date),
			expect.any(Number)
		);
	});

	it('12b. fails when the process never reaches online state after restart', async () => {
		const deps = makeRunnerDeps({}, ['stopped']);
		const project = { ...TEST_PROJECT, targetPath: workingDir };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.deploymentRepo.mocks.markFailed).toHaveBeenCalledWith(
			'dep-1',
			'pm2',
			expect.stringContaining('did not reach online'),
			expect.any(Date),
			expect.any(Number)
		);
	});

	it('fails explicitly when local modifications would be destroyed (non-destructive policy)', async () => {
		const deps = makeRunnerDeps({
			hasLocalChanges: vi.fn().mockResolvedValue(true)
		});
		const project = { ...TEST_PROJECT, targetPath: workingDir };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.deploymentRepo.mocks.markFailed).toHaveBeenCalledWith(
			'dep-1',
			'git',
			expect.stringContaining('Local modifications'),
			expect.any(Date),
			expect.any(Number)
		);
		expect(deps.gitService.fetchOrigin).not.toHaveBeenCalled();
	});

	it('fails when targetPath is not configured or missing', async () => {
		const deps = makeRunnerDeps();
		const project = { ...TEST_PROJECT, targetPath: '/definitely/missing/path-xyz' };
		const runner = new DeploymentRunner(deps as any);

		await runner.run(makeDeployment(), project);

		expect(deps.deploymentRepo.mocks.markFailed).toHaveBeenCalledWith(
			'dep-1',
			'git',
			expect.stringContaining('Working directory not found'),
			expect.any(Date),
			expect.any(Number)
		);
	});
});

describe('DeploymentWorker — concurrency protection', () => {
	function makeWorkerDeps() {
		return {
			deploymentRepo: makeDeploymentRepo(),
			projectRepo: {
				getById: vi
					.fn()
					.mockImplementation(async (id: string) => ({ ...TEST_PROJECT, id, targetPath: tmpdir() }))
			},
			runner: { run: vi.fn().mockResolvedValue(undefined) } as any
		};
	}

	it('13. defers pending jobs for a project that already has a running deployment', async () => {
		const deps = makeWorkerDeps();
		const jobBusy = makeDeployment();
		jobBusy.id = 'dep-busy';
		const jobOther = makeDeployment();
		jobOther.id = 'dep-other';
		jobOther.projectId = 'project-2';

		// First call returns the busy job; second call (with exclusions) returns another project's job
		deps.deploymentRepo.mocks.findNextPending
			.mockResolvedValueOnce(jobBusy)
			.mockResolvedValueOnce(jobOther)
			.mockResolvedValue(null);
		deps.deploymentRepo.mocks.hasRunningForProject.mockImplementation(
			async (projectId: string) => projectId === 'project-1'
		);
		deps.deploymentRepo.mocks.getById.mockImplementation(async (id: string) =>
			id === 'dep-other' ? jobOther : jobBusy
		);

		const worker = new DeploymentWorker(deps as any);
		await worker.kick();

		expect(deps.runner.run).toHaveBeenCalledTimes(1);
		expect(deps.runner.run).toHaveBeenCalledWith(jobOther, expect.objectContaining({ id: 'project-2' }));
		// The busy project's job was excluded from selection on the second lookup
		expect(deps.deploymentRepo.mocks.findNextPending).toHaveBeenNthCalledWith(2, ['dep-busy']);
	});

	it('marks stale running deployments as failed on first kick (recovery)', async () => {
		const deps = makeWorkerDeps();
		deps.deploymentRepo.mocks.findNextPending.mockResolvedValue(null);
		deps.deploymentRepo.mocks.failStaleRunning.mockResolvedValue(2);

		const worker = new DeploymentWorker(deps as any);
		await worker.kick();

		expect(deps.deploymentRepo.mocks.failStaleRunning).toHaveBeenCalledTimes(1);
	});

	it('marks deployment failed when the project no longer exists', async () => {
		const deps = makeWorkerDeps();
		const job = makeDeployment();
		deps.deploymentRepo.mocks.findNextPending.mockResolvedValueOnce(job).mockResolvedValue(null);
		deps.deploymentRepo.mocks.getById.mockResolvedValue(job);
		deps.projectRepo.getById.mockResolvedValue(null);

		const worker = new DeploymentWorker(deps as any);
		await worker.kick();

		expect(deps.deploymentRepo.mocks.markFailed).toHaveBeenCalledWith(
			'dep-1',
			'worker',
			expect.stringContaining('Project not found'),
			expect.any(Date),
			0
		);
	});
});
