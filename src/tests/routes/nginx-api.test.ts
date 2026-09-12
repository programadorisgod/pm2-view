import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock adminHandler
vi.mock('$lib/server/admin-handler', () => ({
	adminHandler: vi.fn((handler: any) => {
		return async (event: any) => {
			const user = event.locals?.user;
			if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
			if (user.role !== 'admin') throw Object.assign(new Error('Forbidden'), { status: 403 });
			return handler(event, user);
		};
	})
}));

// Mock rate-limiter
vi.mock('$lib/rate-limiter', () => ({
	rateLimiter: {
		check: vi.fn().mockReturnValue({ allowed: true })
	}
}));

// Mock NginxService
const mockListFiles = vi.fn();
const mockReadFile = vi.fn();
const mockSaveFile = vi.fn();
const mockCreateAppFile = vi.fn();
const mockTestConfig = vi.fn();
const mockReloadNginx = vi.fn();

vi.mock('$lib/nginx/nginx.service', () => ({
	NginxService: class {
		getBaseDir() {
			return '/etc/nginx/conf.d';
		}
		listFiles = mockListFiles;
		readFile = mockReadFile;
		saveFile = mockSaveFile;
		createAppFile = mockCreateAppFile;
		testConfig = mockTestConfig;
		reloadNginx = mockReloadNginx;
	}
}));

import { GET as getConfigs, POST as postConfigs } from '../../../src/routes/api/nginx/configs/+server';
import { GET as getConfigFile } from '../../../src/routes/api/nginx/configs/file/+server';
import { POST as postTest } from '../../../src/routes/api/nginx/test/+server';
import { POST as postReload } from '../../../src/routes/api/nginx/reload/+server';

describe('Nginx API Endpoints', () => {
	const adminUser = {
		id: 'admin-1',
		email: 'admin@clinicamedicos.com',
		name: 'Admin',
		role: 'admin',
		banned: false,
		banReason: null
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/nginx/configs', () => {
		it('should reject unauthorized user with 401', async () => {
			const event = {
				locals: { user: null },
				getClientAddress: () => '127.0.0.1'
			} as any;

			await expect(getConfigs(event)).rejects.toMatchObject({ status: 401 });
		});

		it('should return configs list for admin', async () => {
			mockListFiles.mockResolvedValueOnce([
				{ filename: 'rpatic.conf', relativePath: 'rpatic.conf', isApp: false }
			]);

			const event = {
				locals: { user: adminUser },
				getClientAddress: () => '127.0.0.1'
			} as any;

			const response = await getConfigs(event);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.files.length).toBe(1);
			expect(data.baseDir).toBe('/etc/nginx/conf.d');
		});
	});

	describe('POST /api/nginx/configs?action=save', () => {
		it('should save file and return testResult', async () => {
			mockSaveFile.mockResolvedValueOnce({
				ok: true,
				testResult: { ok: true, output: 'syntax is ok', exitCode: 0 }
			});

			const event = {
				locals: { user: adminUser },
				getClientAddress: () => '127.0.0.1',
				url: new URL('http://localhost/api/nginx/configs?action=save'),
				request: {
					json: async () => ({
						path: 'apps/api-test.conf',
						content: 'location /test { proxy_pass http://localhost:3000; }',
						password: 'sudo-password'
					})
				}
			} as any;

			const response = await postConfigs(event);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.testResult.ok).toBe(true);
			expect(mockSaveFile).toHaveBeenCalledWith(
				'apps/api-test.conf',
				'location /test { proxy_pass http://localhost:3000; }',
				'sudo-password'
			);
		});
	});

	describe('POST /api/nginx/configs?action=create', () => {
		it('should create new app file and return filename + testResult', async () => {
			mockCreateAppFile.mockResolvedValueOnce({
				ok: true,
				filename: 'nuevo-servicio.conf',
				testResult: { ok: true, output: 'syntax is ok', exitCode: 0 }
			});

			const event = {
				locals: { user: adminUser },
				getClientAddress: () => '127.0.0.1',
				url: new URL('http://localhost/api/nginx/configs?action=create'),
				request: {
					json: async () => ({
						name: 'nuevo-servicio',
						content: 'location /nuevo/ { proxy_pass http://localhost:5000; }',
						password: 'sudo-password'
					})
				}
			} as any;

			const response = await postConfigs(event);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.filename).toBe('nuevo-servicio.conf');
			expect(data.testResult.ok).toBe(true);
		});
	});

	describe('POST /api/nginx/test', () => {
		it('should run test and return output', async () => {
			mockTestConfig.mockResolvedValueOnce({
				ok: true,
				output: 'nginx: configuration file /etc/nginx/nginx.conf test is successful',
				exitCode: 0
			});

			const event = {
				locals: { user: adminUser },
				getClientAddress: () => '127.0.0.1',
				request: {
					json: async () => ({})
				}
			} as any;

			const response = await postTest(event);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.output).toContain('test is successful');
		});
	});

	describe('POST /api/nginx/reload', () => {
		it('should reload Nginx with password and return result', async () => {
			mockReloadNginx.mockResolvedValueOnce({
				ok: true,
				output: 'Nginx recargado exitosamente.',
				exitCode: 0
			});

			const event = {
				locals: { user: adminUser },
				getClientAddress: () => '127.0.0.1',
				request: {
					json: async () => ({ password: 'secret-password' })
				}
			} as any;

			const response = await postReload(event);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(mockReloadNginx).toHaveBeenCalledWith('secret-password');
		});
	});
});
