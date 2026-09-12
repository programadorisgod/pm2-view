import { json } from '@sveltejs/kit';
import { settingsService } from '$lib/server/containers/settings';
import { apiError } from '$lib/server/containers/api-helpers';
import type { NotificationChannelType } from '$lib/types';

export async function GET() {
	return json(settingsService.appSettings());
}

export async function POST({ request }) {
	const body = (await request.json().catch(() => ({}))) as {
		to?: string;
		from?: string;
		multiTo?: boolean;
		enabledChannels?: NotificationChannelType[];
	};
	try {
		settingsService.update({
			to: body.to,
			from: body.from,
			multiTo: body.multiTo,
			enabledChannels: body.enabledChannels
		});
		return json(settingsService.appSettings());
	} catch (err) {
		return apiError(500, `No se pudieron guardar los ajustes: ${(err as Error).message}`);
	}
}
