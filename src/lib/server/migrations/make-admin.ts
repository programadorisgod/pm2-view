import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { users } from '../../db/schema/users';
import { eq } from 'drizzle-orm';

const client = createClient({
	url: process.env.TURSO_DATABASE_URL!,
	authToken: process.env.TURSO_AUTH_TOKEN
});
const db = drizzle(client, { schema: { users } });

async function run(): Promise<void> {
	const email = process.argv[2];

	if (!email) {
		console.log('Usage: npm run make-admin <email>');
		console.log('Example: npm run make-admin admin@example.com');
		process.exit(1);
	}

	console.log(`[Make Admin] Looking up user with email: ${email}`);

	const user = await db
		.select()
		.from(users)
		.where(eq(users.email, email))
		.get();

	if (!user) {
		console.error(`[Make Admin] No user found with email: ${email}`);
		process.exit(1);
	}

	if (user.role === 'admin') {
		console.log(`[Make Admin] User ${email} is already an admin.`);
		process.exit(0);
	}

	await db
		.update(users)
		.set({ role: 'admin' })
		.where(eq(users.id, user.id));

	console.log(`[Make Admin] User ${email} (${user.id}) promoted to admin.`);
}

run()
	.then(() => { console.log('[Make Admin] Complete'); process.exit(0); })
	.catch((error) => { console.error('[Make Admin] Failed:', error); process.exit(1); });
