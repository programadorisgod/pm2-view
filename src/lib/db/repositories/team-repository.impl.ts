import { db } from '../db';
import { teams, teamMembers } from '../schema';
import { eq, desc, count, and } from 'drizzle-orm';
import type { ITeamRepository, Team, TeamMember, TeamWithMemberCount } from './team-repository.interface';

/**
 * Drizzle ORM implementation of ITeamRepository
 * Uses Drizzle ORM to query teams and team_members tables
 */
export class TeamRepository implements ITeamRepository {
	async findById(id: string): Promise<Team | null> {
		const team = await db.query.teams.findFirst({
			where: eq(teams.id, id),
			with: {
				teamMembers: {
					with: {
						user: {
							columns: {
								id: true,
								email: true,
								name: true,
								role: true
							}
						}
					}
				}
			}
		});

		return team ?? null;
	}

	async findByName(name: string): Promise<Team | null> {
		const team = await db.query.teams.findFirst({
			where: sql`LOWER(${teams.name}) = LOWER(${name})`
		});

		return team ?? null;
	}

	async findAll(options: { limit: number; offset: number }): Promise<{ teams: TeamWithMemberCount[]; total: number }> {
		// Get teams with member counts
		const teamsResult = await db.query.teams.findMany({
			limit: options.limit,
			offset: options.offset,
			orderBy: desc(teams.createdAt),
			with: {
				teamMembers: {
					columns: {
						userId: true,
						role: true
					}
				}
			}
		});

		// Get total count
		const [{ count: total }] = await db
			.select({ count: count() })
			.from(teams);

		// Map to TeamWithMemberCount
		const teamsWithCount: TeamWithMemberCount[] = teamsResult.map((team) => ({
			...team,
			memberCount: team.teamMembers?.length ?? 0
		}));

		return {
			teams: teamsWithCount,
			total: Number(total)
		};
	}

	async create(team: { name: string; description?: string; ownerId: string }): Promise<Team> {
		// Use transaction to create team and add owner
		const [newTeam] = await db
			.insert(teams)
			.values({
				id: crypto.randomUUID(),
				name: team.name,
				description: team.description ?? null
			})
			.returning();

		// Add owner to team_members
		await db.insert(teamMembers).values({
			id: crypto.randomUUID(),
			teamId: newTeam.id,
			userId: team.ownerId,
			role: 'team_owner'
		});

		// Return team with relations
		const createdTeam = await this.findById(newTeam.id);
		return createdTeam!;
	}

	async update(id: string, data: { name?: string; description?: string }): Promise<Team> {
		const [updated] = await db
			.update(teams)
			.set(data)
			.where(eq(teams.id, id))
			.returning();

		if (!updated) {
			throw new Error(`Team with id ${id} not found`);
		}

		// Return team with relations
		const team = await this.findById(id);
		return team!;
	}

	async delete(id: string): Promise<void> {
		// Delete team members first (though cascade should handle this)
		await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
		// Delete team
		await db.delete(teams).where(eq(teams.id, id));
	}

	async addMember(teamId: string, userId: string, role: string): Promise<TeamMember> {
		const [member] = await db
			.insert(teamMembers)
			.values({
				id: crypto.randomUUID(),
				teamId,
				userId,
				role
			})
			.returning();

		return member;
	}

	async removeMember(teamId: string, userId: string): Promise<void> {
		await db
			.delete(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
	}

	async updateMemberRole(teamId: string, userId: string, role: string): Promise<void> {
		await db
			.update(teamMembers)
			.set({ role })
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
	}

	async countOwners(teamId: string): Promise<number> {
		const [{ count: ownerCount }] = await db
			.select({ count: count() })
			.from(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'team_owner')));

		return Number(ownerCount);
	}

	async findMember(teamId: string, userId: string): Promise<TeamMember | null> {
		const member = await db.query.teamMembers.findFirst({
			where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
		});

		return member ?? null;
	}

	async getUserTeams(userId: string): Promise<Team[]> {
		const memberships = await db.query.teamMembers.findMany({
			where: eq(teamMembers.userId, userId),
			with: {
				team: {
					with: {
						teamMembers: {
							columns: {
								userId: true,
								role: true
							}
						}
					}
				}
			}
		});

		// Return teams enriched with their members
		return memberships.map(m => ({
			...m.team,
			teamMembers: m.team.teamMembers
		})) as Team[];
	}
}

/**
 * Factory function to create TeamRepository
 * Uses default db import
 */
export function createTeamRepository(): TeamRepository {
	return new TeamRepository();
}
