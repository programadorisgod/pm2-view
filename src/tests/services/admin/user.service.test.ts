import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '$lib/services/admin/user.service';
import type { IAuthRepository, User } from '$lib/auth/auth.types';
import type { IAuditLogRepository } from '$lib/db/repositories/audit-log-repository.interface';

// Mock @sveltejs/kit error function
vi.mock('@sveltejs/kit', () => ({
  error: vi.fn((status: number, message: string) => {
    const err = new Error(message) as Error & { status: number };
    err.status = status;
    throw err;
  }),
  json: vi.fn((data: any) => new Response(JSON.stringify(data)))
}));

// Mock user data
const mockAdmin: User = {
  id: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin',
  role: 'admin',
  banned: false,
  banReason: null,
  emailVerified: true,
  createdAt: new Date()
};

const mockUser1: User = {
  id: 'user-1',
  email: 'user1@test.com',
  name: 'User 1',
  role: 'user',
  banned: false,
  banReason: null,
  emailVerified: true,
  createdAt: new Date()
};

const mockUser2: User = {
  id: 'user-2',
  email: 'user2@test.com',
  name: 'User 2',
  role: 'admin',
  banned: false,
  banReason: null,
  emailVerified: true,
  createdAt: new Date()
};

describe('UserService', () => {
  let authRepo: any;
  let auditRepo: any;
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    authRepo = {
      listUsers: vi.fn(),
      getUserById: vi.fn(),
      setRole: vi.fn(),
      banUser: vi.fn(),
      unbanUser: vi.fn(),
      deleteUser: vi.fn(),
      createUser: vi.fn(),
      createSession: vi.fn(),
      getSession: vi.fn(),
      deleteSession: vi.fn(),
      getUserByEmail: vi.fn()
    };

    auditRepo = {
      create: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn()
    };

    userService = new UserService(authRepo, auditRepo);
  });

  describe('listUsers', () => {
    it('should return paginated results', async () => {
      const mockResult = {
        users: [mockUser1, mockUser2],
        total: 2
      };
      authRepo.listUsers.mockResolvedValue(mockResult);

      const result = await userService.listUsers({ page: 1, limit: 20 });

      expect(result.users).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1
      });
    });

    it('should apply role filter', async () => {
      const mockResult = {
        users: [mockUser2],
        total: 1
      };
      authRepo.listUsers.mockResolvedValue(mockResult);

      await userService.listUsers({ page: 1, limit: 20, role: 'admin' });

      expect(authRepo.listUsers).toHaveBeenCalledWith({
        limit: 20,
        offset: 0,
        role: 'admin'
      });
    });
  });

  describe('createUser', () => {
    it('should create user and log audit', async () => {
      const newUser = { ...mockUser1, id: 'new-user', email: 'new@test.com' };
      authRepo.createUser.mockResolvedValue(newUser);

      const result = await userService.createUser({
        email: 'new@test.com',
        name: 'New User',
        role: 'user'
      }, 'admin-1');

      expect(result).toEqual(newUser);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user_create',
          actorId: 'admin-1',
          targetId: 'new-user'
        })
      );
    });
  });

  describe('updateUser - role change', () => {
    it('should update user role and log audit', async () => {
      authRepo.getUserById.mockResolvedValue(mockUser1);
      authRepo.listUsers.mockResolvedValue({
        users: [mockAdmin, mockUser2],
        total: 2
      });

      await userService.updateUser('user-1', { role: 'admin' }, 'admin-1');

      expect(authRepo.setRole).toHaveBeenCalledWith('user-1', 'admin');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user_role_change' })
      );
    });

    it('should prevent self-modification (throw 403)', async () => {
      await expect(
        userService.updateUser('admin-1', { role: 'user' }, 'admin-1')
      ).rejects.toThrow('Cannot change your own role');

      expect(authRepo.setRole).not.toHaveBeenCalled();
    });

    it('should prevent removing last admin (throw 409)', async () => {
      authRepo.getUserById.mockResolvedValue(mockUser2);
      authRepo.listUsers.mockResolvedValue({
        users: [mockUser2],
        total: 1
      });

      await expect(
        userService.updateUser('user-2', { role: 'user' }, 'admin-1')
      ).rejects.toThrow('Cannot remove the last admin');

      expect(authRepo.setRole).not.toHaveBeenCalled();
    });
  });

  describe('updateUser - ban user', () => {
    it('should ban user and log audit', async () => {
      authRepo.getUserById.mockResolvedValue(mockUser1);

      await userService.updateUser('user-1', { banned: true, banReason: 'Violation' }, 'admin-1');

      expect(authRepo.banUser).toHaveBeenCalledWith('user-1', 'Violation');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user_ban' })
      );
    });

    it('should prevent self-banning (throw 403)', async () => {
      await expect(
        userService.updateUser('admin-1', { banned: true }, 'admin-1')
      ).rejects.toThrow('Cannot ban yourself');
    });
  });

  describe('deleteUser', () => {
    it('should prevent self-deletion (throw 403)', async () => {
      await expect(
        userService.deleteUser('admin-1', 'admin-1')
      ).rejects.toThrow('Cannot delete yourself');
    });

    it('should delete user when not last admin', async () => {
      const userToDelete = { ...mockUser1, role: 'user' };
      authRepo.getUserById.mockResolvedValue(userToDelete);
      authRepo.listUsers.mockResolvedValue({
        users: [mockAdmin, mockUser2],
        total: 2
      });

      await userService.deleteUser('user-1', 'admin-1');

      expect(authRepo.deleteUser).toHaveBeenCalledWith('user-1');
    });
  });
});
