import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { users } from '../../db/schema/users';
import { eq, isNull } from 'drizzle-orm';

const client = createClient({
	url: process.env.TURSO_DATABASE_URL!,
	authToken: process.env.TURSO_AUTH_TOKEN
});
const db = drizzle(client, { schema: { users } });

export async function run(): Promise<void> {
	console.log('[Migration] Starting set-default-roles migration...');

	try {
		const usersWithoutRole = await db
			.select()
			.from(users)
			.where(isNull(users.role));

		console.log(`[Migration] Found ${usersWithoutRole.length} users without role`);

		if (usersWithoutRole.length === 0) {
			console.log('[Migration] No users need role update. Migration complete.');
			return;
		}

		for (const user of usersWithoutRole) {
			await db
				.update(users)
				.set({ role: 'user' })
				.where(eq(users.id, user.id));

			console.log(`[Migration] Updated user ${user.id} (${user.email}) with role "user"`);
		}

		console.log(`[Migration] Successfully updated ${usersWithoutRole.length} users with default role "user"`);
	} catch (error) {
		console.error('[Migration] Error in set-default-roles migration:', error);
		throw error;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	run()
		.then(() => { console.log('[Migration] Complete'); process.exit(0); })
		.catch((error) => { console.error('[Migration] Failed:', error); process.exit(1); });
}
