import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import { parseEnv, stringifyEnv } from '$lib/utils/env-parser';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { spawn } from 'child_process';
import { z } from 'zod';

const envSchema = z.object({
	envVars: z.record(z.string(), z.string()),
	restart: z.boolean().optional().default(false),
	processName: z.string().optional(),
});

export const GET: RequestHandler = async ({ params }) => {
	const id = params.id;
	if (!id) {
		return json({ error: 'Process ID is required' }, { status: 400 });
	}

	try {
		// Get process info to find working directory
		const { PM2Service } = await import('$lib/pm2/pm2.service');
		const { PM2Repository } = await import('$lib/pm2/pm2-repository.impl');
		const pm2Service = new PM2Service(new PM2Repository());
		const process = await pm2Service.getProcessById(id);

		if (!process) {
			return json({ error: 'Process not found' }, { status: 404 });
		}

		const cwd = pm2Service.resolveProjectDir(process);
		if (!cwd) {
			return json({ error: 'Process working directory not found' }, { status: 400 });
		}

		const envPath = join(cwd, '.env');
		let envVars: Record<string, string> = {};

		if (existsSync(envPath)) {
			const content = readFileSync(envPath, 'utf-8');
			envVars = parseEnv(content);
		}

		return json({
			success: true,
			envVars,
			envPath,
			processName: process.name,
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to read env file', { processId: id, errorMessage });
		return json({ error: `Failed to read env: ${errorMessage}` }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const id = params.id;
	if (!id) {
		return json({ error: 'Process ID is required' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validationResult = envSchema.safeParse(body);
	if (!validationResult.success) {
		const issues = validationResult.error.issues;
		const message = issues.length > 0 ? issues[0].message : 'Validation failed';
		return json({ error: message }, { status: 400 });
	}

	const { envVars, restart, processName } = validationResult.data;

	try {
		// Get process info to find working directory
		const { PM2Service } = await import('$lib/pm2/pm2.service');
		const { PM2Repository } = await import('$lib/pm2/pm2-repository.impl');
		const pm2Service = new PM2Service(new PM2Repository());
		const process = await pm2Service.getProcessById(id);

		if (!process) {
			return json({ error: 'Process not found' }, { status: 404 });
		}

		const cwd = pm2Service.resolveProjectDir(process);
		if (!cwd) {
			return json({ error: 'Process working directory not found' }, { status: 400 });
		}

		// Write .env file
		const envContent = stringifyEnv(envVars);
		const envPath = join(cwd, '.env');
		writeFileSync(envPath, envContent + '\n', 'utf-8');

		logger.info('Environment file written', {
			processId: id,
			processName: process.name,
			cwd,
			varCount: Object.keys(envVars).length,
		});

		// Restart if requested and process is running
		let restarted = false;
		if (restart) {
			const name = processName || process.name;
			const isRunning = process.status === 'online';

			if (isRunning) {
				await runPm2Restart(name);
				restarted = true;
				logger.info('PM2 process restarted with new env', { processName: name });
			} else {
				logger.info('Process not running, skipping restart', { processName: name, status: process.status });
			}
		}

		return json({
			success: true,
			varCount: Object.keys(envVars).length,
			envPath,
			restarted,
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to write env file', { processId: id, errorMessage });
		return json({ error: `Failed to write env: ${errorMessage}` }, { status: 500 });
	}
};

const importEnvSchema = z.object({
	fileContent: z.string().max(500_000),
	targetPath: z.string().min(1).max(500).optional(),
});

export const POST: RequestHandler = async ({ params, request }) => {
	const id = params.id;
	if (!id) {
		return json({ error: 'Process ID is required' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validationResult = importEnvSchema.safeParse(body);
	if (!validationResult.success) {
		const issues = validationResult.error.issues;
		const message = issues.length > 0 ? issues[0].message : 'Validation failed';
		return json({ error: message }, { status: 400 });
	}

	const { fileContent, targetPath } = validationResult.data;

	try {
		// Get process info to find working directory
		const { PM2Service } = await import('$lib/pm2/pm2.service');
		const { PM2Repository } = await import('$lib/pm2/pm2-repository.impl');
		const pm2Service = new PM2Service(new PM2Repository());
		const process = await pm2Service.getProcessById(id);

		if (!process) {
			return json({ error: 'Process not found' }, { status: 404 });
		}

		const cwd = pm2Service.resolveProjectDir(process);
		if (!cwd) {
			return json({ error: 'Process working directory not found' }, { status: 400 });
		}

		// Resolve the destination against the project dir and reject
		// anything that escapes it (path traversal protection).
		// Normalize the project root first: PM2 may report it with mixed
		// separators, which would break the prefix check below.
		const projectRoot = resolve(cwd);
		const relativeTarget = targetPath?.trim() || '.env';
		const dest = resolve(projectRoot, relativeTarget);
		if (dest !== projectRoot && !dest.startsWith(projectRoot + sep)) {
			return json({ error: 'Target path must be inside the project directory' }, { status: 400 });
		}
		if (dest === projectRoot) {
			return json({ error: 'Target path must be a file inside the project directory' }, { status: 400 });
		}

		// Parse the uploaded content and write it to the chosen path
		const envVars = parseEnv(fileContent);
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, stringifyEnv(envVars) + '\n', 'utf-8');

		logger.info('Environment file imported', {
			processId: id,
			processName: process.name,
			envPath: dest,
			varCount: Object.keys(envVars).length,
		});

		return json({
			success: true,
			envVars,
			envPath: dest,
			varCount: Object.keys(envVars).length,
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to import env file', { processId: id, errorMessage });
		return json({ error: `Failed to import env: ${errorMessage}` }, { status: 500 });
	}
};

function runPm2Restart(name: string): Promise<number> {
	return new Promise((resolve) => {
		const proc = spawn('pm2', ['restart', name, '--update-env'], {
			shell: false,
			env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
		});

		proc.on('close', (code) => resolve(code ?? 1));
		proc.on('error', () => resolve(1));
	});
}
