import { env } from '$env/dynamic/private';

export const TURSO_DATABASE_URL = env.TURSO_DATABASE_URL || '';
export const TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN || '';
