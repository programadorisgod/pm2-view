import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { projects } from '../../db/schema/projects';
import { projectMembers } from '../../db/schema/project-members';
import { eq } from 'drizzle-orm';

function getDb() {
	return drizzle(
		createClient({
			url: process.env.TURSO_DATABASE_URL!,
			authToken: process.env.TURSO_AUTH_TOKEN
		}),
		{ schema: { projects, projectMembers } }
	);
}

export async function run(db = getDb()): Promise<void> {
	console.log('[Migration] Starting create-project-members migration...');

	try {
		const allProjects = await db.select().from(projects);
		console.log(`[Migration] Found ${allProjects.length} projects`);

		if (allProjects.length === 0) {
			console.log('[Migration] No projects to process. Migration complete.');
			return;
		}

		let createdCount = 0;

		for (const project of allProjects) {
			const existingMembers = await db
				.select()
				.from(projectMembers)
				.where(eq(projectMembers.projectId, project.id));

			const creatorIsMember = existingMembers.some((m) => m.userId === project.userId);

			if (creatorIsMember) {
				console.log(`[Migration] Creator ${project.userId} already member of project ${project.id}, skipping`);
				continue;
			}

			await db.insert(projectMembers).values({
				id: crypto.randomUUID(),
				projectId: project.id,
				userId: project.userId,
				role: 'owner',
				createdAt: new Date()
			});

			console.log(`[Migration] Created project_members entry for creator ${project.userId} in project ${project.id}`);
			createdCount++;
		}

		console.log(`[Migration] Successfully created ${createdCount} project_members entries`);
	} catch (error) {
		console.error('[Migration] Error in create-project-members migration:', error);
		throw error;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	run()
		.then(() => { console.log('[Migration] Complete'); process.exit(0); })
		.catch((error) => { console.error('[Migration] Failed:', error); process.exit(1); });
}
