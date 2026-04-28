import { createAuthClient } from 'better-auth/svelte';
import { base } from '$app/paths';

export const authClient = createAuthClient({
	basePath: `${base}/api/auth`
});
