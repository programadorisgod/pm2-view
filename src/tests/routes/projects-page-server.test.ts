import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PageServerLoad, Actions } from '../../../src/routes/(app)/projects/[id]/$types';
import type { AuthUser } from '$lib/auth/provider.interface';

// Mock services
const mockGetProcessById = vi.fn();
const mockGetProcessLogs = vi.fn();
const mockGetEnvVars = vi.fn();
const mockSaveAndRestart = vi.fn();

vi.mock('$lib/pm2/pm2.service', () => ({
	PM2Service: vi.fn().mockImplementation(() => ({
		getProcessById: (...args: unknown[]) => mockGetProcessById(...args),
		getProcessLogs: (...args: unknown[]) => mockGetProcessLogs(...args)
	}))
}));

vi.mock('$lib/env-vars/env-var.service', () => ({
	EnvVarService: vi.fn().mockImplementation(() => ({
		getEnvVars: (...args: unknown[]) => mockGetEnvVars(...args),
		saveAndRestart: (...args: unknown[]) => mockSaveAndRestart(...args)
	}))
}));

vi.mock('$lib/services/factory', () => ({
	createServices: () => ({
		pm2Service: {
			getProcessById: (...args: unknown[]) => mockGetProcessById(...args),
			getProcessLogs: (...args: unknown[]) => mockGetProcessLogs(...args)
		},
		envVarService: {
			getEnvVars: (...args: unknown[]) => mockGetEnvVars(...args),
			saveAndRestart: (...args: unknown[]) => mockSaveAndRestart(...args)
		}
	})
}));

// Import after mocking
import { load, actions } from '../../../src/routes/(app)/projects/[id]/+page.server.ts';

describe('projects/[id]/+page.server.ts - Permission Checks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('load function', () => {
		it('should load project data when project exists', async () => {
			mockGetProcessById.mockResolvedValue({ id: 'project-1', name: 'Test Project' });
			mockGetProcessLogs.mockResolvedValue([]);
			mockGetEnvVars.mockResolvedValue({});

			const event = {
				params: { id: 'project-1' }
			} as unknown as Parameters<PageServerLoad>[0];

			const result = await load(event);

			expect(result).toBeDefined();
			expect(result.process).toEqual({ id: 'project-1', name: 'Test Project' });
		});

		it('should throw 404 when project not found', async () => {
			mockGetProcessById.mockResolvedValue(null);

			const event = {
				params: { id: 'project-999' }
			} as unknown as Parameters<PageServerLoad>[0];

			try {
				await load(event);
				expect.fail('Expected error to be thrown');
			} catch (e: unknown) {
				const err = e as { status?: number };
				expect(err.status).toBe(404);
			}
		});
	});

	describe('saveEnv action - Permission Checks', () => {
		it('should allow owner to save env vars', async () => {
			mockSaveAndRestart.mockResolvedValue({ success: true, message: 'Saved' });

			const user: AuthUser = {
				id: 'owner-1',
				email: 'owner@test.com',
				name: 'Owner',
				role: 'user',
				banned: false,
				banReason: null
			};

			const formData = new FormData();
			formData.append('envVars', JSON.stringify({ NODE_ENV: 'production' }));

			const event = {
				params: { id: 'project-1' },
				request: {
					formData: () => formData
				},
				locals: {
					user,
					memberRole: 'owner'
				}
			} as unknown as Parameters<Actions['saveEnv']>[0];

			const result = await actions.saveEnv(event);

			expect(result).toEqual({ success: true, message: 'Saved' });
		});

		it('should allow editor to save env vars', async () => {
			mockSaveAndRestart.mockResolvedValue({ success: true, message: 'Saved' });

			const user: AuthUser = {
				id: 'editor-1',
				email: 'editor@test.com',
				name: 'Editor',
				role: 'user',
				banned: false,
				banReason: null
			};

			const formData = new FormData();
			formData.append('envVars', JSON.stringify({ NODE_ENV: 'production' }));

			const event = {
				params: { id: 'project-1' },
				request: {
					formData: () => formData
				},
				locals: {
					user,
					memberRole: 'editor'
				}
			} as unknown as Parameters<Actions['saveEnv']>[0];

			const result = await actions.saveEnv(event);

			expect(result).toEqual({ success: true, message: 'Saved' });
		});

		it('should throw 403 when viewer tries to save env vars', async () => {
			const user: AuthUser = {
				id: 'viewer-1',
				email: 'viewer@test.com',
				name: 'Viewer',
				role: 'viewer',
				banned: false,
				banReason: null
			};

			const formData = new FormData();
			formData.append('envVars', JSON.stringify({ NODE_ENV: 'production' }));

			const event = {
				params: { id: 'project-1' },
				request: {
					formData: () => formData
				},
				locals: {
					user,
					memberRole: 'viewer'
				}
			} as unknown as Parameters<Actions['saveEnv']>[0];

			try {
				await actions.saveEnv(event);
				expect.fail('Expected error to be thrown');
			} catch (e: unknown) {
				const err = e as { status?: number };
				expect(err.status).toBe(403);
			}
		});
	});
});
