import { db } from '../db';
import { projectMembers } from '../schema';
import { eq, and } from 'drizzle-orm';
import type { IProjectMemberRepository, ProjectMember } from './project-member-repository.interface';

/**
 * Drizzle ORM implementation of IProjectMemberRepository
 * Manages project membership (owners, editors, viewers)
 */
export class ProjectMemberRepository implements IProjectMemberRepository {
	async findByProject(projectId: string): Promise<ProjectMember[]> {
		const members = await db.query.projectMembers.findMany({
			where: eq(projectMembers.projectId, projectId),
			with: {
				user: {
					columns: {
						id: true,
						email: true,
						name: true
					}
				}
			}
		});

		return members;
	}

	async findByUser(userId: string): Promise<ProjectMember[]> {
		const members = await db.query.projectMembers.findMany({
			where: eq(projectMembers.userId, userId),
			with: {
				user: {
					columns: {
						id: true,
						email: true,
						name: true
					}
				}
			}
		});

		return members;
	}

	async findMember(projectId: string, userId: string): Promise<ProjectMember | null> {
		const member = await db.query.projectMembers.findFirst({
			where: and(
				eq(projectMembers.projectId, projectId),
				eq(projectMembers.userId, userId)
			)
		});

		return member ?? null;
	}

	async add(member: { projectId: string; userId: string; role: string }): Promise<ProjectMember> {
		// Check if member already exists (idempotent - update role if exists)
		const existing = await this.findMember(member.projectId, member.userId);

		if (existing) {
			// Update role if different
			if (existing.role !== member.role) {
				await db
					.update(projectMembers)
					.set({ role: member.role })
					.where(
						and(
							eq(projectMembers.projectId, member.projectId),
							eq(projectMembers.userId, member.userId)
						)
					);
				// Return updated member
				const updated = await this.findMember(member.projectId, member.userId);
				return updated!;
			}
			return existing;
		}

		// Create new member
		const [newMember] = await db
			.insert(projectMembers)
			.values({
				id: crypto.randomUUID(),
				projectId: member.projectId,
				userId: member.userId,
				role: member.role
			})
			.returning();

		return newMember;
	}

	async remove(projectId: string, userId: string): Promise<void> {
		await db
			.delete(projectMembers)
			.where(
				and(
					eq(projectMembers.projectId, projectId),
					eq(projectMembers.userId, userId)
				)
			);
	}

	async updateRole(projectId: string, userId: string, role: string): Promise<void> {
		await db
			.update(projectMembers)
			.set({ role })
			.where(
				and(
					eq(projectMembers.projectId, projectId),
					eq(projectMembers.userId, userId)
				)
			);
	}
}

/**
 * Factory function to create ProjectMemberRepository
 * Uses default db import
 */
export function createProjectMemberRepository(): ProjectMemberRepository {
	return new ProjectMemberRepository();
}
