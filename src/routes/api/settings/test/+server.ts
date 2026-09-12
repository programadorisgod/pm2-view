import { json } from '@sveltejs/kit';
import { watcher } from '$lib/server/containers/runtime';

export async function POST() {
	const result = await watcher.sendTest();
	return json(result, { status: result.ok ? 200 : 400 });
}
