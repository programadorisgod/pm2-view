import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const pm2Repo = new PM2Repository();
const pm2Service = new PM2Service(pm2Repo);

export const GET: RequestHandler = async ({ params, url }) => {
	const { id } = params;

	// Parse optional query params
	const lines = parseInt(url.searchParams.get('lines') || '100', 10);

	try {
		const logs = await pm2Service.getProcessLogs(id, lines);

		return json({
			success: true,
			logs
		});
	} catch (error) {
		return json(
			{
				success: false,
				message: error instanceof Error ? error.message : 'Failed to fetch logs',
				logs: []
			},
			{ status: 500 }
		);
	}
};
