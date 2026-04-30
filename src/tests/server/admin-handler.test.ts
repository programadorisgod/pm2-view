import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import type { AuthUser } from '$lib/auth/provider.interface';

// Define mockAuthUser helper
function createAdminUser(): AuthUser {
  return {
    id: 'admin-1',
    email: 'admin@test.com',
    name: 'Admin',
    role: 'admin',
    banned: false,
    banReason: null,
    emailVerified: true,
    createdAt: new Date()
  };
}

function createRegularUser(): AuthUser {
  return {
    id: 'user-1',
    email: 'user@test.com',
    name: 'User',
    role: 'user',
    banned: false,
    banReason: null,
    emailVerified: true,
    createdAt: new Date()
  };
}

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

// Mock requireAdmin - will be overridden in tests
vi.mock('$lib/server/route-guards', () => ({
  requireAdmin: vi.fn()
}));

// Import after mocking
import { adminHandler } from '$lib/server/admin-handler';
import { requireAdmin } from '$lib/server/route-guards';

describe('adminHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset requireAdmin to not throw by default
    (requireAdmin as any).mockImplementation(() => {
      // Default: do nothing (admin check passes)
    });
  });

  it('should call handler when user is admin', async () => {
    const adminUser = createAdminUser();

    const mockEvent = {
      locals: { user: adminUser }
    } as RequestEvent;

    const mockHandler = vi.fn().mockResolvedValue(new Response('success'));
    const wrappedHandler = adminHandler(mockHandler);

    await wrappedHandler(mockEvent);

    expect(requireAdmin).toHaveBeenCalledWith(adminUser);
    expect(mockHandler).toHaveBeenCalledWith(mockEvent, adminUser);
  });

  it('should throw 401 when no user', async () => {
    const mockEvent = {
      locals: { user: null }
    } as RequestEvent;

    const mockHandler = vi.fn();
    const wrappedHandler = adminHandler(mockHandler);

    await expect(wrappedHandler(mockEvent)).rejects.toThrow('Unauthorized');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should throw 403 when user is not admin', async () => {
    const regularUser = createRegularUser();

    // Mock requireAdmin to throw for non-admin
    (requireAdmin as any).mockImplementation(() => {
      throw Object.assign(new Error('403: Access denied'), { status: 403 });
    });

    const mockEvent = {
      locals: { user: regularUser }
    } as RequestEvent;

    const mockHandler = vi.fn();
    const wrappedHandler = adminHandler(mockHandler);

    await expect(wrappedHandler(mockEvent)).rejects.toMatchObject({ status: 403 });
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should pass user to handler', async () => {
    const adminUser = createAdminUser();

    let passedUser: AuthUser | undefined;
    const mockHandler = vi.fn().mockImplementation((event, user) => {
      passedUser = user;
      return new Response('success');
    });

    const mockEvent = {
      locals: { user: adminUser }
    } as RequestEvent;

    const wrappedHandler = adminHandler(mockHandler);
    await wrappedHandler(mockEvent);

    expect(passedUser).toEqual(adminUser);
  });

  it('should catch and re-throw SvelteKit errors with status', async () => {
    const adminUser = createAdminUser();

    // Handler throws a SvelteKit error with status
    const mockHandler = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error('Not found'), { status: 404 });
    });

    const mockEvent = {
      locals: { user: adminUser }
    } as RequestEvent;

    const wrappedHandler = adminHandler(mockHandler);

    await expect(wrappedHandler(mockEvent)).rejects.toMatchObject({ status: 404 });
  });

  it('should catch generic errors and throw 500', async () => {
    const adminUser = createAdminUser();

    // Handler throws generic error (no status)
    const mockHandler = vi.fn().mockImplementation(() => {
      throw new Error('Something went wrong');
    });

    const mockEvent = {
      locals: { user: adminUser }
    } as RequestEvent;

    const wrappedHandler = adminHandler(mockHandler);

    await expect(wrappedHandler(mockEvent)).rejects.toMatchObject({ status: 500 });
  });

  it('should handle handler returning json response', async () => {
    const adminUser = createAdminUser();

    const mockHandler = vi.fn().mockImplementation(() => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const mockEvent = {
      locals: { user: adminUser }
    } as RequestEvent;

    const wrappedHandler = adminHandler(mockHandler);
    const response = await wrappedHandler(mockEvent);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
