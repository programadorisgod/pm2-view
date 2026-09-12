import { json } from '@sveltejs/kit';
import { watcher } from '$lib/server/containers/runtime';

export async function POST() {
	const result = await watcher.pollOnce();
	return json(result);
}
