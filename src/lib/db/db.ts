import { drizzle as createDrizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema/index';
import { env } from '$env/dynamic/private';

function getDb() {
	const url = env.TURSO_DATABASE_URL;
	const token = env.TURSO_AUTH_TOKEN;

	if (!url) {
		throw new Error('TURSO_DATABASE_URL is not set. Check your .env file.');
	}

	const client = createClient({
		url,
		authToken: token
	});
	return createDrizzle(client, { schema });
}

// Export a proxy that lazily initializes the db
const dbProxy = new Proxy({} as ReturnType<typeof getDb>, {
	get(_, prop: string | symbol) {
		const db = getDb();
		return db[prop as keyof typeof db];
	}
});

export const db = dbProxy;
export const drizzle = dbProxy;
