import { error } from '@sveltejs/kit';
import type { IAuthRepository, User } from '$lib/auth/auth.types';
import type { IAuditLogRepository } from '$lib/db/repositories/audit-log-repository.interface';
import { BetterAuthUserRepository } from '$lib/db/repositories/better-auth-user-repository.impl';
import { AuditLogRepository } from '$lib/db/repositories/audit-log-repository.impl';

export interface UserListResult {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListUsersOptions {
  page?: number;
  limit?: number;
  role?: string;
}

export interface CreateUserInput {
  email: string;
  password?: string;
  name?: string | null;
  role?: string;
}

export interface UpdateUserInput {
  role?: string;
  banned?: boolean;
  banReason?: string;
}

export class UserService {
  constructor(
    private authRepo: IAuthRepository,
    private auditRepo: IAuditLogRepository
  ) {}

  async listUsers(options: ListUsersOptions): Promise<UserListResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const offset = (page - 1) * limit;

    const result = await this.authRepo.listUsers({
      limit,
      offset,
      role: options.role
    });

    const totalPages = Math.ceil(result.total / limit);

    return {
      users: result.users,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages
      }
    };
  }

  async createUser(input: CreateUserInput, actorId: string): Promise<User> {
    const user = await this.authRepo.createUser({
      email: input.email,
      name: input.name ?? null,
      role: input.role ?? 'user',
      emailVerified: false,
      banned: false,
      banReason: null
    });

    await this.auditRepo.create({
      action: 'user_create',
      actorId,
      targetId: user.id,
      resourceType: 'user',
      resourceId: user.id,
      details: {
        email: user.email,
        name: user.name,
        role: user.role
      }
    });

    return user;
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.authRepo.getUserById(userId);
  }

  async updateUser(userId: string, updates: UpdateUserInput, actorId: string, headers?: Headers): Promise<void> {
    // Handle role change
    if (updates.role !== undefined) {
      // Check not self
      if (userId === actorId) {
        throw error(403, 'Cannot change your own role');
      }

      // Check not last admin if demoting from admin
      if (updates.role !== 'admin') {
        const user = await this.authRepo.getUserById(userId);
        if (user?.role === 'admin') {
          const adminsResult = await this.authRepo.listUsers({
            limit: 1000,
            offset: 0,
            role: 'admin'
          });
          if (adminsResult.users.length <= 1) {
            throw error(409, 'Cannot remove the last admin');
          }
        }
      }

      // Sequence: auth call first, then audit
      await this.authRepo.setRole(userId, updates.role, headers);

      await this.auditRepo.create({
        action: 'user_role_change',
        actorId,
        targetId: userId,
        resourceType: 'user',
        resourceId: userId,
        details: {
          newRole: updates.role
        }
      });
    }

    // Handle ban
    if (updates.banned === true) {
      // Check not self
      if (userId === actorId) {
        throw error(403, 'Cannot ban yourself');
      }

      // Check not last admin
      const user = await this.authRepo.getUserById(userId);
      if (user?.role === 'admin') {
        const adminsResult = await this.authRepo.listUsers({
          limit: 1000,
          offset: 0,
          role: 'admin'
        });
        if (adminsResult.users.length <= 1) {
          throw error(409, 'Cannot ban the last admin');
        }
      }

      // Sequence: auth call first, then audit
      await this.authRepo.banUser(userId, updates.banReason ?? 'Banned by administrator', headers);

      await this.auditRepo.create({
        action: 'user_ban',
        actorId,
        targetId: userId,
        resourceType: 'user',
        resourceId: userId,
        details: {
          reason: updates.banReason
        }
      });
    }

    // Handle unban
    if (updates.banned === false) {
      // Sequence: auth call first, then audit
      await this.authRepo.unbanUser(userId, headers);

      await this.auditRepo.create({
        action: 'user_unban',
        actorId,
        targetId: userId,
        resourceType: 'user',
        resourceId: userId,
        details: {}
      });
    }
  }

  async deleteUser(userId: string, actorId: string, headers?: Headers): Promise<void> {
    // Check not self
    if (userId === actorId) {
      throw error(403, 'Cannot delete yourself');
    }

    // Check not last admin
    const user = await this.authRepo.getUserById(userId);
    if (user?.role === 'admin') {
      const adminsResult = await this.authRepo.listUsers({
        limit: 1000,
        offset: 0,
        role: 'admin'
      });
      if (adminsResult.users.length <= 1) {
        throw error(409, 'Cannot delete the last admin');
      }
    }

    // Sequence: auth call first, then audit
    await this.authRepo.deleteUser(userId);

    await this.auditRepo.create({
      action: 'user_delete',
      actorId,
      targetId: userId,
      resourceType: 'user',
      resourceId: userId,
      details: {
        email: user?.email,
        name: user?.name
      }
    });
  }
}

/**
 * Factory function to create UserService with default repositories
 */
export function createUserService(): UserService {
  return new UserService(new BetterAuthUserRepository(), new AuditLogRepository());
}
