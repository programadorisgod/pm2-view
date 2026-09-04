import { createServices } from '$lib/services/factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { portManagerService } = createServices();
	const { ports, summary } = await portManagerService.getPorts();
	return { ports, summary };
};
