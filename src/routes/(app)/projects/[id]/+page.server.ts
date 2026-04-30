import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { EnvVarService } from '$lib/env-vars/env-var.service';
import { createServices } from '$lib/services/factory';
import { error, fail } from '@sveltejs/kit';
import { hasPermission } from '$lib/auth/permissions';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';

// Schema for environment variables save action
const envVarSchema = z.object({
	envVars: z.string().min(1, 'Environment variables are required')
});

export const load: PageServerLoad = async ({ params }) => {
	const { pm2Service, envVarService } = createServices();
	const { id } = params;

	const process = await pm2Service.getProcessById(id);

	if (!process) {
		throw error(404, `Process with ID ${id} not found`);
	}

	// Get logs (limited to 50 lines for the detail page)
	const logs = await pm2Service.getProcessLogs(id, 50);

	// Get environment variables
	const envVars = await envVarService.getEnvVars(id);

	return {
		process,
		logs,
		envVars
	};
};

export const actions: Actions = {
	saveEnv: async ({ request, params, locals }) => {
		const { envVarService } = createServices();
		const { id } = params;

		// Check permission - only owner and editor can update
		const memberRole = (locals as any)?.memberRole;
		const user = (locals as any)?.user;

		if (memberRole === 'viewer' || (user && user.role === 'viewer')) {
			throw error(403, 'Access denied: Insufficient permissions to modify project');
		}

		const formData = await request.formData();
		const data = Object.fromEntries(formData);

		const result = envVarSchema.safeParse(data);
		if (!result.success) {
			return fail(400, {
				error: 'Invalid environment variables format'
			});
		}

		try {
			// Parse the JSON string of env vars
			const envVars = JSON.parse(result.data.envVars) as Record<string, string>;

			// Save and restart
			const response = await envVarService.saveAndRestart(id, envVars);

			if (!response.success) {
				return fail(500, { error: response.message });
			}

			return { success: true, message: response.message };
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Failed to parse environment variables'
			});
		}
	}
};
