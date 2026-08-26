import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must use vi.hoisted to ensure mock is available when vi.mock runs
const mockGetAllProcesses = vi.hoisted(() => vi.fn());

// Mock database module
vi.mock('$lib/db', () => ({
  db: {
    query: {
      projects: {
        findMany: vi.fn().mockResolvedValue([])
      }
    }
  }
}));

// Mock adminHandler
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

// Mock @sveltejs/kit
vi.mock('@sveltejs/kit', () => ({
  json: vi.fn((data: any, init?: ResponseInit) => {
    return new Response(JSON.stringify(data), {
      status: init?.status || 200,
      headers: { 'content-type': 'application/json' }
    });
  })
}));

// Mock createServices
vi.mock('$lib/services/factory', () => ({
  createServices: () => ({
    pm2Service: {
      getAllProcesses: mockGetAllProcesses
    }
  })
}));

// Import after mocking
import { GET } from '../../../src/routes/api/pm2/unregistered/+server';

describe('api/pm2/unregistered/+server.ts - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when user is not authenticated', async () => {
    const event = {
      locals: { user: null }
    } as any;

    await expect(GET(event)).rejects.toMatchObject({ status: 401 });
  });

  it('should return 403 when non-admin user tries to fetch', async () => {
    const event = {
      locals: { user: { id: 'user-1', email: 'user@test.com', name: 'User', role: 'user', banned: false, banReason: null } }
    } as any;

    await expect(GET(event)).rejects.toMatchObject({ status: 403 });
  });
});
