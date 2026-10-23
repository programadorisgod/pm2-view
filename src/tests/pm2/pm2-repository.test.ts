import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PM2Repository, parsePM2JList, isPM2Module, classifyLogLevel } from '../../lib/pm2/pm2-repository.impl';
import type { IPM2Repository } from '../../lib/pm2/pm2.types';

describe('PM2 Repository', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should implement IPM2Repository interface', () => {
		const repo: IPM2Repository = new PM2Repository();
		expect(repo).toBeDefined();
		expect(typeof repo.list).toBe('function');
		expect(typeof repo.describe).toBe('function');
		expect(typeof repo.restart).toBe('function');
		expect(typeof repo.stop).toBe('function');
		expect(typeof repo.delete).toBe('function');
		expect(typeof repo.getLogs).toBe('function');
		expect(typeof repo.clearLogs).toBe('function');
	});

	it('should be instantiable', () => {
		const repo = new PM2Repository();
		expect(repo instanceof PM2Repository).toBe(true);
	});

	it('should have all required methods', () => {
		const repo = new PM2Repository();
		const methods: (keyof IPM2Repository)[] = [
			'list',
			'describe',
			'restart',
			'stop',
			'delete',
			'getLogs',
			'clearLogs'
		];
		methods.forEach((method) => {
			expect(typeof repo[method]).toBe('function');
		});
	});

	it('should return empty array for list (no processes)', () => {
		const repo = new PM2Repository();
		expect(repo.list).toBeDefined();
	});

	it('should handle describe for non-existent process', () => {
		const repo = new PM2Repository();
		expect(repo.describe).toBeDefined();
	});

	it('should have correct method signatures', () => {
		const repo = new PM2Repository();
		expect(repo.list.length).toBe(1);
		expect(repo.describe.length).toBe(1);
		expect(repo.restart.length).toBe(1);
		expect(repo.stop.length).toBe(1);
		expect(repo.delete.length).toBe(1);
		expect(repo.getLogs.length).toBe(1);
		expect(repo.clearLogs.length).toBe(1);
	});
});

describe('parsePM2JList Robustness', () => {
	it('should parse clean JSON array output', () => {
		const stdout = JSON.stringify([
			{ name: 'app-1', pm_id: 0, monit: { memory: 100, cpu: 1 }, pm2_env: { status: 'online' } }
		]);
		const result = parsePM2JList(stdout);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('app-1');
	});

	it('should parse output with leading [PM2] banners and daemon messages', () => {
		const stdout = `
[PM2] Spawning PM2 daemon with pm2_home=/home/rpatic/.pm2
[PM2] PM2 Successfully daemonized
[{"name":"atlas-backend","pm_id":6,"monit":{"cpu":0,"memory":1024},"pm2_env":{"status":"online"}}]
`;
		const result = parsePM2JList(stdout);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('atlas-backend');
		expect(result[0].pm_id).toBe(6);
	});

	it('should parse output with warnings and module messages before JSON', () => {
		const stdout = `
Module: pm2-logrotate
[PM2][WARN] module-db-v2:pm2-logrotate is not a valid format
[
  {
    "name": "api-report",
    "pm_id": 8,
    "monit": { "cpu": 5, "memory": 2048 },
    "pm2_env": { "status": "online" }
  }
]
`;
		const result = parsePM2JList(stdout);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('api-report');
	});

	it('should parse output with trailing [PM2] notices', () => {
		const stdout = `
[PM2] Applying config
[{"name":"cartera-dashboard","pm_id":12,"monit":{"cpu":0,"memory":512},"pm2_env":{"status":"stopped"}}]
[PM2] Done.
`;
		const result = parsePM2JList(stdout);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('cartera-dashboard');
	});

	it('should handle empty stdout gracefully', () => {
		expect(parsePM2JList('')).toEqual([]);
		expect(parsePM2JList('   \n  ')).toEqual([]);
		expect(parsePM2JList('[]')).toEqual([]);
	});

	it('should throw descriptive error when no JSON array is found', () => {
		expect(() => parsePM2JList('pm2: command not found')).toThrowError(/Failed to parse PM2 jlist output/);
	});
});

describe('isPM2Module', () => {
	it('should identify PM2 modules correctly', () => {
		expect(isPM2Module({ name: 'pm2-logrotate', pm2_env: { pmx_module: true } })).toBe(true);
		expect(isPM2Module({ name: 'pm2-server-monit', pm2_env: { axm_options: { isModule: true } } })).toBe(true);
		expect(isPM2Module({ name: 'custom-module', pmx_module: true })).toBe(true);
	});

	it('should not flag standard application processes as modules', () => {
		expect(isPM2Module({ name: 'atlas-backend', pm2_env: { status: 'online' } })).toBe(false);
		expect(isPM2Module({ name: 'cartera-dashboard', pm2_env: { status: 'stopped', pmx_module: false } })).toBe(false);
		expect(isPM2Module(null)).toBe(false);
		expect(isPM2Module(undefined)).toBe(false);
	});
});

describe('classifyLogLevel Robustness', () => {
	it('should classify Spanish [ALERTA] as warn even when emitted on stderr', () => {
		const line = '2026-10-23 10:21:36 -05:00: [Flujo][ALERTA] Desbalance en SOAT: gap 80.89x (umbral: 1.4x).';
		expect(classifyLogLevel(line, 'err')).toBe('warn');
	});

	it('should classify deadlock retries as warn even when emitted on stderr', () => {
		const line = '2026-10-23 10:24:52 -05:00: [CarteraRepository] Deadlock detected, retry 1/3 after 1000ms';
		expect(classifyLogLevel(line, 'err')).toBe('warn');
	});

	it('should classify warning emojis as warn', () => {
		const line = '[Flujo] ⚠️ 3 balance alert(s) detected this run';
		expect(classifyLogLevel(line, 'out')).toBe('warn');
		expect(classifyLogLevel(line, 'err')).toBe('warn');
	});

	it('should classify true fatal/binding errors as error', () => {
		const line = "ERROR: [Errno 98] error while attempting to bind on address ('127.0.0.1', 4001): address already in use";
		expect(classifyLogLevel(line, 'err')).toBe('error');
		expect(classifyLogLevel(line, 'out')).toBe('error');
	});

	it('should classify startup logs on stderr as info', () => {
		const line = 'INFO: Started server process [3998246]';
		expect(classifyLogLevel(line, 'err')).toBe('info');
	});
});
