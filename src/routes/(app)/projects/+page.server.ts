import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';

const pm2Repo = new PM2Repository();
const pm2Service = new PM2Service(pm2Repo);

const actionSchema = z.object({
	pm_id: z.string().min(1, 'Process ID is required')
});

export const load: PageServerLoad = async () => {
	const processes = await pm2Service.getAllProcesses();
	return {
		processes
	};
};

function getZodErrorMessage(result: any): string {
	if (result.success) return '';
	// Zod v4 error format uses 'issues' array
	const firstError = result.error?.issues?.[0] || result.issues?.[0];
	return firstError?.message || 'Validation failed';
}

export const actions: Actions = {
	restart: async ({ request }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = actionSchema.safeParse(data);
		if (!result.success) {
			return fail(400, {
				error: getZodErrorMessage(result)
			});
		}

		const { pm_id } = result.data;
		const response = await pm2Service.restartProcess(pm_id);

		if (!response.success) {
			return fail(500, { error: response.message });
		}

		return { success: true, message: response.message };
	},

	stop: async ({ request }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = actionSchema.safeParse(data);
		if (!result.success) {
			return fail(400, {
				error: getZodErrorMessage(result)
			});
		}

		const { pm_id } = result.data;
		const response = await pm2Service.stopProcess(pm_id);

		if (!response.success) {
			return fail(500, { error: response.message });
		}

		return { success: true, message: response.message };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = actionSchema.safeParse(data);
		if (!result.success) {
			return fail(400, {
				error: getZodErrorMessage(result)
			});
		}

		const { pm_id } = result.data;
		const response = await pm2Service.deleteProcess(pm_id);

		if (!response.success) {
			return fail(500, { error: response.message });
		}

		return { success: true, message: response.message };
	}
};
