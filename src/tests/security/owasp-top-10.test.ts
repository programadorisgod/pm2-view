import { describe, it, expect, vi } from 'vitest';
import { handle } from '$lib/../hooks.server';
import { requireAdmin, requireRole, requireProjectAccess } from '$lib/server/route-guards';
import { createAuditService } from '$lib/services/admin/audit.service';
import type { AuthUser } from '$lib/auth/provider.interface';

// Mock DB for route-guards
const mockProjectMemberFindFirst = vi.fn();
vi.mock('$lib/db', () => ({
	db: {
		query: {
			projectMembers: {
				findFirst: (...args: unknown[]) => mockProjectMemberFindFirst(...args)
			}
		}
	}
}));

// Mock @sveltejs/kit error
vi.mock('@sveltejs/kit', async () => {
	const actual = await vi.importActual<any>('@sveltejs/kit');
	return {
		...actual,
		error: vi.fn((status: number, message: string) => {
			const err = new Error(message) as Error & { status: number };
			err.status = status;
			throw err;
		})
	};
});

describe('OWASP Top 10 Security Hardening Tests', () => {
	describe('OWASP A01: Broken Access Control & RBAC Hierarchy', () => {
		const regularUser: AuthUser = {
			id: 'user-1',
			email: 'user@example.com',
			name: 'User One',
			emailVerified: true,
			createdAt: new Date(),
			role: 'user',
			banned: false,
			banReason: null
		};

		const bannedUser: AuthUser = {
			...regularUser,
			id: 'banned-1',
			banned: true,
			banReason: 'Malicious activity'
		};

		it('rejects banned users regardless of role', async () => {
			await expect(requireProjectAccess('proj-1', bannedUser)).rejects.toThrow();
			expect(() => requireAdmin(bannedUser)).toThrow();
			expect(() => requireRole(bannedUser, 'user')).toThrow();
		});

		it('enforces role hierarchy where owner has editor and viewer rights', async () => {
			mockProjectMemberFindFirst.mockResolvedValue({
				id: 'pm-1',
				projectId: 'proj-1',
				userId: regularUser.id,
				role: 'owner',
				createdAt: new Date()
			});

			// Owner satisfies editor requirement
			await expect(requireProjectAccess('proj-1', regularUser, 'editor')).resolves.not.toThrow();
			// Owner satisfies viewer requirement
			await expect(requireProjectAccess('proj-1', regularUser, 'viewer')).resolves.not.toThrow();
		});

		it('enforces role hierarchy where editor has viewer rights but not owner rights', async () => {
			mockProjectMemberFindFirst.mockResolvedValue({
				id: 'pm-1',
				projectId: 'proj-1',
				userId: regularUser.id,
				role: 'editor',
				createdAt: new Date()
			});

			// Editor satisfies viewer requirement
			await expect(requireProjectAccess('proj-1', regularUser, 'viewer')).resolves.not.toThrow();
			// Editor satisfies editor requirement
			await expect(requireProjectAccess('proj-1', regularUser, 'editor')).resolves.not.toThrow();
			// Editor DOES NOT satisfy owner requirement
			await expect(requireProjectAccess('proj-1', regularUser, 'owner')).rejects.toThrow();
		});

		it('blocks viewer from editor or owner actions', async () => {
			mockProjectMemberFindFirst.mockResolvedValue({
				id: 'pm-1',
				projectId: 'proj-1',
				userId: regularUser.id,
				role: 'viewer',
				createdAt: new Date()
			});

			await expect(requireProjectAccess('proj-1', regularUser, 'editor')).rejects.toThrow();
			await expect(requireProjectAccess('proj-1', regularUser, 'owner')).rejects.toThrow();
		});
	});

	describe('OWASP A03: Injection & CSV Formula Protection', () => {
		it('sanitizes formula characters in CSV export to prevent DDE injection', () => {
			const mockRepo: any = {
				findAll: vi.fn().mockResolvedValue({
					logs: [
						{
							id: 'log-1',
							action: '=1+1',
							actor: { email: '+admin@test.com', name: '@attacker' },
							targetId: '-100',
							resourceType: '\tcmd',
							resourceId: '\rpowershell',
							details: 'normal detail',
							timestamp: new Date('2026-01-01T00:00:00.000Z')
						}
					],
					total: 1
				}),
				count: vi.fn().mockResolvedValue(1)
			};

			const auditService = new (createAuditService().constructor as any)(mockRepo);
			return auditService.exportCSV({}).then((csv: string) => {
				// Each formula prefix should be prepended with a single quote
				expect(csv).toContain("'+admin@test.com");
				expect(csv).toContain("'@attacker");
				expect(csv).toContain("'-100");
				expect(csv).toContain("'\tcmd");
			});
		});
	});

	describe('OWASP A05: Security Headers in Server Hook', () => {
		it('injects mandatory security headers in responses', async () => {
			const mockResolve = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
			const mockEvent: any = {
				url: new URL('http://localhost:5173/'),
				request: new Request('http://localhost:5173/'),
				locals: {}
			};

			const response = await handle({ event: mockEvent, resolve: mockResolve });

			expect(response.headers.get('X-Frame-Options')).toBe('DENY');
			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
			expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
			expect(response.headers.get('Content-Security-Policy')).toBeDefined();
			expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
		});
	});
});
