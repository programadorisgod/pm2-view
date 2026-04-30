import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUserService } = vi.hoisted(() => ({
  mockUserService: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    getUserById: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn()
  }
}));

vi.mock('$lib/services/admin/user.service', () => ({
  UserService: vi.fn(),
  createUserService: vi.fn(() => mockUserService)
}));

vi.mock('$lib/validation/user-schemas', () => ({
  listUsersQuerySchema: {
    safeParse: vi.fn((data) => ({ success: true, data }))
  },
  createUserSchema: {
    safeParse: vi.fn((data) => ({ success: true, data }))
  },
  updateUserSchema: {
    safeParse: vi.fn((data) => ({ success: true, data }))
  }
}));

vi.mock('$lib/server/admin-handler', () => ({
  adminHandler: vi.fn((handler: any) => {
    return async (event: any) => {
      const user = event.locals.user;
      if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
      if (user.role !== 'admin') throw Object.assign(new Error('Forbidden'), { status: 403 });
      return handler(event, user);
    };
  })
}));

vi.mock('@sveltejs/kit', () => ({
  error: vi.fn((status: number, message: string) => {
    const err = new Error(message) as Error & { status: number };
    err.status = status;
    throw err;
  }),
  json: vi.fn((data: any, init?: ResponseInit) => {
    return new Response(JSON.stringify(data), {
      status: init?.status || 200,
      headers: { 'content-type': 'application/json' }
    });
  })
}));

import { GET, POST } from '../../../src/routes/(app)/admin/users/+server';

const adminUser = { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null };

describe('admin/users/+server.ts - GET', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return users list with pagination when admin is authenticated', async () => {
    mockUserService.listUsers.mockResolvedValue({
      users: [{ id: 'u1', email: 'a@b.com', name: 'A' }, { id: 'u2', email: 'c@d.com', name: 'C' }],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
    });

    const event = {
      url: new URL('http://localhost/admin/users?page=1&limit=20'),
      locals: { user: adminUser }
    } as any;

    const response = await GET(event);
    const data = await response.json();

    expect(mockUserService.listUsers).toHaveBeenCalled();
    expect(data.users).toHaveLength(2);
  });

  it('should throw 401 when not authenticated', async () => {
    await expect(GET({ url: new URL('http://localhost/admin/users'), locals: { user: null } } as any)).rejects.toMatchObject({ status: 401 });
  });

  it('should throw 403 when non-admin', async () => {
    await expect(GET({ url: new URL('http://localhost/admin/users'), locals: { user: { ...adminUser, role: 'user' } } } as any)).rejects.toMatchObject({ status: 403 });
  });
});

describe('admin/users/+server.ts - POST', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should create a new user when admin is authenticated', async () => {
    mockUserService.createUser.mockResolvedValue({ id: 'new-user', email: 'new@test.com', name: 'New User', role: 'user' });

    const event = {
      request: { json: () => Promise.resolve({ email: 'new@test.com', password: 'password123', name: 'New User', role: 'user' }) },
      locals: { user: adminUser }
    } as any;

    const response = await POST(event);
    const data = await response.json();

    expect(mockUserService.createUser).toHaveBeenCalled();
    expect(data.user).toBeDefined();
    expect(response.status).toBe(201);
  });

  it('should throw 401 when not authenticated', async () => {
    await expect(POST({ request: { json: () => Promise.resolve({}) }, locals: { user: null } } as any)).rejects.toMatchObject({ status: 401 });
  });
});
