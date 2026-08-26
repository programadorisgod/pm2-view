import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use hoisted to ensure mocks are available when vi.mock runs
const { mockProjectRepo, mockAuditRepo, mockAddMember } = vi.hoisted(() => {
  const mockProjectRepoInstance = {
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({
      id: 'project-1',
      name: 'test-process',
      pm2Name: 'test-process',
      description: 'PM2 process: test-process',
      userId: 'admin-1',
      teamId: null,
      targetPath: null,
      createdAt: new Date()
    })
  };
  const mockAuditRepoInstance = {
    create: vi.fn().mockResolvedValue(undefined)
  };
  return {
    mockProjectRepo: mockProjectRepoInstance,
    mockAuditRepo: mockAuditRepoInstance,
    mockAddMember: vi.fn().mockResolvedValue(undefined)
  };
});

// Mock ProjectRepository
vi.mock('$lib/db/repositories/project-repository.impl', () => {
  function MockProjectRepository() {
    return mockProjectRepo;
  }
  return { ProjectRepository: MockProjectRepository };
});

// Mock AuditLogRepository
vi.mock('$lib/db/repositories/audit-log-repository.impl', () => {
  function MockAuditLogRepository() {
    return mockAuditRepo;
  }
  return { AuditLogRepository: MockAuditLogRepository };
});

// Mock ProjectSharingService
vi.mock('$lib/services/admin/project-sharing.service', () => ({
  createProjectSharingService: vi.fn().mockReturnValue({
    addMember: mockAddMember
  })
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

// Mock rateLimiter
vi.mock('$lib/rate-limiter', () => ({
  rateLimiter: {
    check: vi.fn(() => ({ allowed: true, remaining: 100 }))
  }
}));

// Mock @sveltejs/kit
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

// Import after mocking
import { POST } from '../../../src/routes/api/projects/register/+server';

describe('api/projects/register/+server.ts - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to default values
    mockProjectRepo.getAll.mockResolvedValue([]);
    mockProjectRepo.create.mockResolvedValue({
      id: 'project-1',
      name: 'test-process',
      pm2Name: 'test-process',
      description: 'PM2 process: test-process',
      userId: 'admin-1',
      teamId: null,
      targetPath: null,
      createdAt: new Date()
    });
  });

  it('should register a process successfully', async () => {
    const event = {
      request: {
        json: () => Promise.resolve({
          processName: 'test-process',
          name: 'Test Process',
          description: 'A test process',
          targetPath: '/home/user'
        }),
        headers: new Headers()
      },
      getClientAddress: () => '127.0.0.1',
      locals: { user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null } }
    } as any;

    const response = await POST(event);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.project.name).toBe('test-process');
  });

  it('should register a process with team and members', async () => {
    const event = {
      request: {
        json: () => Promise.resolve({
          processName: 'shared-process',
          name: 'Shared Process',
          teamId: 'team-1',
          members: [
            { userId: 'user-1', role: 'owner' },
            { userId: 'user-2', role: 'editor' }
          ]
        }),
        headers: new Headers()
      },
      getClientAddress: () => '127.0.0.1',
      locals: { user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null } }
    } as any;

    const response = await POST(event);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(mockAddMember).toHaveBeenCalledTimes(2);
  });

  it('should return 409 when process is already registered', async () => {
    // Mock existing project
    mockProjectRepo.getAll.mockResolvedValue([{
      id: 'existing-project',
      name: 'Existing Process',
      pm2Name: 'test-process'
    }]);

    const event = {
      request: {
        json: () => Promise.resolve({
          processName: 'test-process',
          name: 'Test Process'
        }),
        headers: new Headers()
      },
      getClientAddress: () => '127.0.0.1',
      locals: { user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null } }
    } as any;

    await expect(POST(event)).rejects.toMatchObject({ status: 409 });
  });

  it('should return 400 when processName is missing', async () => {
    const event = {
      request: {
        json: () => Promise.resolve({
          name: 'Test Process'
          // missing processName
        }),
        headers: new Headers()
      },
      getClientAddress: () => '127.0.0.1',
      locals: { user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null } }
    } as any;

    await expect(POST(event)).rejects.toMatchObject({ status: 400 });
  });

  it('should return 401 when user is not authenticated', async () => {
    const event = {
      request: {
        json: () => Promise.resolve({ processName: 'test' }),
        headers: new Headers()
      },
      getClientAddress: () => '127.0.0.1',
      locals: { user: null }
    } as any;

    await expect(POST(event)).rejects.toMatchObject({ status: 401 });
  });

  it('should return 403 when non-admin user tries to register', async () => {
    const event = {
      request: {
        json: () => Promise.resolve({ processName: 'test' }),
        headers: new Headers()
      },
      getClientAddress: () => '127.0.0.1',
      locals: { user: { id: 'user-1', email: 'user@test.com', name: 'User', role: 'user', banned: false, banReason: null } }
    } as any;

    await expect(POST(event)).rejects.toMatchObject({ status: 403 });
  });

  it('should return 429 when rate limited', async () => {
    const { rateLimiter } = await import('$lib/rate-limiter');
    vi.mocked(rateLimiter.check).mockReturnValueOnce({ allowed: false, remaining: 0, retryAfter: 60 });

    const event = {
      request: {
        json: () => Promise.resolve({ processName: 'test' }),
        headers: new Headers()
      },
      getClientAddress: () => '127.0.0.1',
      locals: { user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null } }
    } as any;

    const response = await POST(event);
    expect(response.status).toBe(429);
  });
});
