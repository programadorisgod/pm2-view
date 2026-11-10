import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { PM2Process } from '$lib/pm2/pm2.types';

const { mockGetSession, mockDescribe, mockGetAllProjects, mockSpawn } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockDescribe: vi.fn(),
	mockGetAllProjects: vi.fn(),
	mockSpawn: vi.fn()
}));

vi.mock('$lib/auth', () => ({
	auth: {
		api: {
			getSession: mockGetSession
		}
	}
}));

vi.mock('$lib/pm2/pm2-repository.impl', () => ({
	PM2Repository: class {
		describe = mockDescribe;
	}
}));

vi.mock('$lib/db/repositories/project-repository.impl', () => ({
	ProjectRepository: class {
		getAll = mockGetAllProjects;
	}
}));

vi.mock('$lib/server/project-access', () => ({
	getProjectRole: vi.fn().mockResolvedValue('owner')
}));

vi.mock('child_process', () => ({
	default: { spawn: mockSpawn, exec: vi.fn() },
	spawn: mockSpawn,
	exec: vi.fn()
}));

import { GET as getEnv, PUT as putEnv } from '../../routes/api/projects/[id]/env/+server';
import { GET as getEnvDirs } from '../../routes/api/projects/[id]/env/dirs/+server';

function makeSpawnChild(exitCode = 0) {
	const child = new EventEmitter();
	queueMicrotask(() => {
		child.emit('close', exitCode);
	});
	return child;
}

describe('Project Env API (/api/projects/[id]/env)', () => {
	const tempDirs: string[] = [];
	const origBetterAuthSecret = process.env.BETTER_AUTH_SECRET;
	const origTursoUrl = process.env.TURSO_DATABASE_URL;

	function createTempDir(prefix: string): string {
		const dir = mkdtempSync(join(tmpdir(), prefix));
		tempDirs.push(dir);
		return dir;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({
			user: { id: 'admin-1', role: 'admin', banned: false }
		});
		mockGetAllProjects.mockResolvedValue([]);
		process.env.BETTER_AUTH_SECRET = 'super-secret-pm2-view-key';
		process.env.TURSO_DATABASE_URL = 'libsql://pm2-view-internal.turso.io';
	});

	afterEach(() => {
		while (tempDirs.length > 0) {
			const dir = tempDirs.pop();
			if (dir) rmSync(dir, { recursive: true, force: true });
		}
		if (origBetterAuthSecret === undefined) {
			delete process.env.BETTER_AUTH_SECRET;
		} else {
			process.env.BETTER_AUTH_SECRET = origBetterAuthSecret;
		}
		if (origTursoUrl === undefined) {
			delete process.env.TURSO_DATABASE_URL;
		} else {
			process.env.TURSO_DATABASE_URL = origTursoUrl;
		}
	});

	it('GET reads .env from pm_cwd when process is launched via global pnpm binary', async () => {
		const projectDir = createTempDir('pm2-view-env-get-');
		writeFileSync(join(projectDir, '.env'), 'PORT_APP=5183\nMSSQL_DATABASE=DGEMPRES01\n', 'utf-8');

		const proc: PM2Process = {
			name: 'cartera-dashboard',
			pm_id: 0,
			monit: { cpu: 1, memory: 1024 },
			pm2_env: {
				status: 'online',
				pm_uptime: Date.now(),
				restart_time: 0,
				pm_cwd: projectDir,
				pm_exec_path: '/home/rpatic/.local/share/pnpm/bin/pnpm'
			}
		};
		mockDescribe.mockResolvedValue(proc);

		const res = await getEnv({
			params: { id: '0' },
			request: new Request('http://localhost/api/projects/0/env')
		} as any);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.envPath).toBe(join(projectDir, '.env'));
		expect(body.envVars).toEqual({
			PORT_APP: '5183',
			MSSQL_DATABASE: 'DGEMPRES01'
		});
	});

	it('PUT writes .env to pm_cwd and passes updated project envVars to pm2 restart without leaking pm2-view secrets', async () => {
		const projectDir = createTempDir('pm2-view-env-put-');
		writeFileSync(join(projectDir, '.env'), 'PORT_APP=5183\n', 'utf-8');

		const proc: PM2Process = {
			name: 'cartera-dashboard',
			pm_id: 0,
			monit: { cpu: 1, memory: 1024 },
			pm2_env: {
				status: 'online',
				pm_uptime: Date.now(),
				restart_time: 0,
				pm_cwd: projectDir,
				pm_exec_path: '/home/rpatic/.local/share/pnpm/bin/pnpm'
			}
		};
		mockDescribe.mockResolvedValue(proc);
		mockSpawn.mockImplementation(() => makeSpawnChild(0));

		const res = await putEnv({
			params: { id: '0' },
			request: new Request('http://localhost/api/projects/0/env', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					envVars: {
						PORT_APP: '5183',
						ASIGNA_ALLOWED_USERS: '1065632427,1066866486'
					},
					restart: true,
					processName: 'cartera-dashboard'
				})
			})
		} as any);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.restarted).toBe(true);
		expect(body.envPath).toBe(join(projectDir, '.env'));

		const diskContent = readFileSync(join(projectDir, '.env'), 'utf-8');
		expect(diskContent).toContain('PORT_APP=5183');
		expect(diskContent).toContain('ASIGNA_ALLOWED_USERS=1065632427,1066866486');

		expect(mockSpawn).toHaveBeenCalledTimes(1);
		const [cmd, args, spawnOpts] = mockSpawn.mock.calls[0];
		expect(cmd).toBe('pm2');
		expect(args).toEqual(['restart', 'cartera-dashboard', '--update-env']);
		expect(spawnOpts.shell).toBe(false);
		expect(spawnOpts.env).toMatchObject({
			PORT_APP: '5183',
			ASIGNA_ALLOWED_USERS: '1065632427,1066866486'
		});
		expect(spawnOpts.env.BETTER_AUTH_SECRET).toBeUndefined();
		expect(spawnOpts.env.TURSO_DATABASE_URL).toBeUndefined();
	});

	it('GET falls back to project.targetPath from DB when pm_cwd is empty for global runner', async () => {
		const projectDir = createTempDir('pm2-view-env-db-fallback-');
		writeFileSync(join(projectDir, '.env'), 'API_PORT=4000\n', 'utf-8');

		const proc: PM2Process = {
			name: 'cartera-dashboard',
			pm_id: 0,
			monit: { cpu: 0, memory: 0 },
			pm2_env: {
				status: 'stopped',
				pm_uptime: 0,
				restart_time: 0,
				pm_cwd: '',
				pm_exec_path: '/home/rpatic/.local/share/pnpm/bin/pnpm'
			}
		};
		mockDescribe.mockResolvedValue(proc);
		mockGetAllProjects.mockResolvedValue([
			{
				id: 'proj-1',
				pm2Name: 'cartera-dashboard',
				pm2Names: null,
				targetPath: projectDir
			}
		]);

		const res = await getEnv({
			params: { id: '0' },
			request: new Request('http://localhost/api/projects/0/env')
		} as any);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.envPath).toBe(join(projectDir, '.env'));
		expect(body.envVars).toEqual({ API_PORT: '4000' });
	});

	it('GET /dirs lists subdirectories inside pm_cwd when process is launched via pnpm', async () => {
		const projectDir = createTempDir('pm2-view-env-dirs-');
		mkdirSync(join(projectDir, 'apps', 'web'), { recursive: true });
		mkdirSync(join(projectDir, 'node_modules', 'pkg'), { recursive: true });

		const proc: PM2Process = {
			name: 'cartera-dashboard',
			pm_id: 0,
			monit: { cpu: 1, memory: 1024 },
			pm2_env: {
				status: 'online',
				pm_uptime: Date.now(),
				restart_time: 0,
				pm_cwd: projectDir,
				pm_exec_path: '/home/rpatic/.local/share/pnpm/bin/pnpm'
			}
		};
		mockDescribe.mockResolvedValue(proc);

		const res = await getEnvDirs({
			params: { id: '0' },
			request: new Request('http://localhost/api/projects/0/env/dirs')
		} as any);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.dirs).toContain('.');
		expect(body.dirs).toContain('apps');
		expect(body.dirs).toContain('apps/web');
		expect(body.dirs).not.toContain('node_modules');
	});
});
