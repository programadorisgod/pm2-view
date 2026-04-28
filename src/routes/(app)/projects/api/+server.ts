import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { createServices } from '$lib/services/factory';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const actionSchema = z.object({
	pm_id: z.string().min(1, 'Process ID is required')
});

function getZodErrorMessage(result: any): string {
	if (result.success) return '';
	const firstError = result.error?.issues?.[0] || result.issues?.[0];
	return firstError?.message || 'Validation failed';
}

export const POST: RequestHandler = async ({ request, url }) => {
	const { pm2Service } = createServices();
	const action = url.searchParams.get('action');
	const body = await request.json();

	const result = actionSchema.safeParse(body);
	if (!result.success) {
		return json({ error: getZodErrorMessage(result) }, { status: 400 });
	}

	const { pm_id } = result.data;

	let response;
	switch (action) {
		case 'restart':
			response = await pm2Service.restartProcess(pm_id);
			break;
		case 'stop':
			response = await pm2Service.stopProcess(pm_id);
			break;
		case 'delete':
			response = await pm2Service.deleteProcess(pm_id);
			break;
		default:
			return json({ error: 'Unknown action' }, { status: 400 });
	}

	if (!response.success) {
		return json({ error: response.message }, { status: 500 });
	}

	return json({ success: true, message: response.message });
};
