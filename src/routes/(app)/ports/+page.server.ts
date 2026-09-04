import { PortManagerService } from '$lib/ports';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const service = new PortManagerService();
	const { ports, summary } = await service.getPorts();
	return { ports, summary };
};
