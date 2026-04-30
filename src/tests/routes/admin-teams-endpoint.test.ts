import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTeamService } = vi.hoisted(() => ({
  mockTeamService: {
    listTeams: vi.fn(),
    createTeam: vi.fn(),
    getTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
    getMember: vi.fn()
  }
}));

// Mock the service module — hoisted before imports
vi.mock('$lib/services/admin/team.service', () => ({
  TeamService: vi.fn(),
  createTeamService: vi.fn(() => mockTeamService)
}));

// Mock validation schemas
vi.mock('$lib/validation/team-schemas', () => ({
  listTeamsQuerySchema: {
    safeParse: vi.fn((data) => ({ success: true, data }))
  },
  createTeamSchema: {
    safeParse: vi.fn((data) => ({ success: true, data }))
  },
  updateTeamSchema: {
    safeParse: vi.fn((data) => ({ success: true, data }))
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
import { GET, POST } from '../../../src/routes/(app)/admin/teams/+server';

describe('admin/teams/+server.ts - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return teams list with pagination when admin is authenticated', async () => {
    mockTeamService.listTeams.mockResolvedValue({
      teams: [
        { id: 'team-1', name: 'Engineering', memberCount: 2 },
        { id: 'team-2', name: 'Design', memberCount: 0 }
      ],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
    });

    const event = {
      url: new URL('http://localhost/admin/teams?page=1&limit=20'),
      locals: { user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null } }
    } as any;

    const response = await GET(event);
    const data = await response.json();

    expect(mockTeamService.listTeams).toHaveBeenCalled();
    expect(data.teams).toHaveLength(2);
  });

  it('should throw 401 when user is not authenticated', async () => {
    const event = {
      url: new URL('http://localhost/admin/teams'),
      locals: { user: null }
    } as any;

    await expect(GET(event)).rejects.toMatchObject({ status: 401 });
  });

  it('should throw 403 when non-admin user tries to list teams', async () => {
    const event = {
      url: new URL('http://localhost/admin/teams'),
      locals: { user: { id: 'user-1', email: 'user@test.com', name: 'User', role: 'user', banned: false, banReason: null } }
    } as any;

    await expect(GET(event)).rejects.toMatchObject({ status: 403 });
  });
});

describe('admin/teams/+server.ts - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a new team when admin is authenticated', async () => {
    mockTeamService.createTeam.mockResolvedValue({
      id: 'new-team',
      name: 'New Team',
      description: 'A new team'
    });

    const event = {
      request: { json: () => Promise.resolve({ name: 'New Team', description: 'A new team' }) },
      locals: { user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null } }
    } as any;

    const response = await POST(event);
    const data = await response.json();

    expect(mockTeamService.createTeam).toHaveBeenCalled();
    expect(data.team).toBeDefined();
    expect(response.status).toBe(201);
  });

  it('should throw 409 when team name already exists', async () => {
    mockTeamService.createTeam.mockImplementation(() => {
      throw Object.assign(new Error('already exists'), { status: 409 });
    });

    const event = {
      request: { json: () => Promise.resolve({ name: 'Existing Team' }) },
      locals: { user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin', role: 'admin', banned: false, banReason: null } }
    } as any;

    await expect(POST(event)).rejects.toMatchObject({ status: 409 });
  });
});
