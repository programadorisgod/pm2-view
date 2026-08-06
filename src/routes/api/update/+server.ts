import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { json } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { logger } from '$lib/logger';

const execAsync = promisify(exec);

const PM2_APP_NAME = 'pm2-view';

async function runStep(
	label: string,
	command: string
): Promise<{ ok: boolean; output: string }> {
	try {
		const { stdout, stderr } = await execAsync(command, {
			cwd: process.cwd(),
			maxBuffer: 10 * 1024 * 1024,
		});
		return { ok: true, output: `${stdout}${stderr}`.trim() };
	} catch (err) {
		const output = err instanceof Error ? err.message : String(err);
		return { ok: false, output };
	}
}

/**
 * Restarts the pm2-view process in the background after a delay.
 * The delay gives the HTTP response time to flush before the server restarts.
 */
function scheduleRestart(): void {
	setTimeout(() => {
		const child = spawn('sh', ['-c', `pm2 restart ${PM2_APP_NAME}`], {
			detached: true,
			stdio: 'ignore',
			cwd: process.cwd(),
		});
		child.unref();
	}, 1500);
}

export const POST = adminHandler(async () => {
	if (!existsSync(join(process.cwd(), 'package.json'))) {
		return json(
			{ success: false, step: 'check', error: 'Project root not found' },
			{ status: 500 }
		);
	}

	const pull = await runStep('git pull', 'git pull');
	if (!pull.ok) {
		logger.error('Update failed at git pull', { output: pull.output });
		return json(
			{ success: false, step: 'git pull', error: pull.output },
			{ status: 500 }
		);
	}

	const build = await runStep('pnpm build', 'pnpm build');
	if (!build.ok) {
		logger.error('Update failed at pnpm build', { output: build.output });
		return json(
			{ success: false, step: 'pnpm build', error: build.output },
			{ status: 500 }
		);
	}

	scheduleRestart();

	return json({
		success: true,
		message: 'Update applied. Restarting pm2-view...',
	});
});
