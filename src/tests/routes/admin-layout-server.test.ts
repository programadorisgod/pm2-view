import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequireAdmin, mockError } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockError: vi.fn((status: number, message: string) => {
    const err = new Error(message);
    (err as any).status = status;
    throw err;
  })
}));

vi.mock('$lib/server/route-guards', () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args)
}));

vi.mock('@sveltejs/kit', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object), error: mockError };
});

import { load } from '../../../src/routes/(app)/admin/+layout.server.ts';

describe('admin/+layout.server.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockImplementation(() => {});
  });

  it('should return user and isAdmin=true when admin accesses admin route', async () => {
    const adminUser = { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null };
    const event = { locals: { user: adminUser } } as any;

    const result = await load(event);

    expect(mockRequireAdmin).toHaveBeenCalledWith(adminUser);
    expect(result).toEqual({ user: adminUser, isAdmin: true });
  });

  it('should throw 403 when non-admin accesses admin route', async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw mockError(403, 'Access denied: Admin role required');
    });

    const regularUser = { id: 'user-1', email: 'user@test.com', name: 'User', role: 'user', banned: false, banReason: null };
    const event = { locals: { user: regularUser } } as any;

    await expect(load(event)).rejects.toThrow('Access denied: Admin role required');
    expect(mockRequireAdmin).toHaveBeenCalledWith(regularUser);
  });

  it('should throw 403 when viewer accesses admin route', async () => {
    mockRequireAdmin.mockImplementation(() => {
      throw mockError(403, 'Access denied: Admin role required');
    });

    const viewerUser = { id: 'viewer-1', email: 'viewer@test.com', name: 'Viewer', role: 'viewer', banned: false, banReason: null };
    const event = { locals: { user: viewerUser } } as any;

    await expect(load(event)).rejects.toThrow('Access denied: Admin role required');
  });

  it('should throw 401 when unauthenticated', async () => {
    const event = { locals: { user: null } } as any;
    await expect(load(event)).rejects.toThrow('Unauthorized');
  });
});
