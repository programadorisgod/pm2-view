import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { db } from '$lib/db';
import { projects } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimiter } from '$lib/rate-limiter';
import { logger } from '$lib/logger';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { findEcosystemFiles } from '$lib/utils/ecosystem';
import { escapeShellArg } from '$lib/utils/shell';
import { z } from 'zod';

const startSchema = z.object({
	projectName: z.string().min(1, 'Project name is required'),
	ecosystemFile: z.string().min(1, 'Ecosystem file is required'),
});

function getZodErrorMessage(result: unknown): string {
	if (result && typeof result === 'object' && 'error' in result) {
		const err = result as { error?: { issues?: Array<{ message?: string }> } };
		const issues = err.error?.issues;
		if (issues && issues.length > 0) {
			return issues[0]?.message || 'Validation failed';
		}
	}
	return 'Validation failed';
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);
	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validationResult = startSchema.safeParse(body);
	if (!validationResult.success) {
		return json({ error: getZodErrorMessage(validationResult) }, { status: 400 });
	}

	const { projectName, ecosystemFile } = validationResult.data;

	// Find project in DB
	const project = await db.query.projects.findFirst({
		where: eq(projects.pm2Name, projectName),
		columns: { id: true, targetPath: true }
	});

	if (!project) {
		return json({ error: 'Project not found in database' }, { status: 404 });
	}

	if (!project.targetPath) {
		return json({ error: 'Project has no target path configured' }, { status: 400 });
	}

	const targetPath = project.targetPath;

	// Validate targetPath exists
	if (!existsSync(targetPath)) {
		return json({ error: `Target path does not exist: ${targetPath}` }, { status: 400 });
	}

	// Validate ecosystem file exists
	const ecosystemPath = join(targetPath, ecosystemFile);
	if (!existsSync(ecosystemPath)) {
		return json({ error: `Ecosystem file not found: ${ecosystemFile}` }, { status: 400 });
	}

	// Sanitize process name
	let sanitizedName: string;
	try {
		sanitizedName = escapeShellArg(projectName).replace(/^'|'$/g, '');
	} catch {
		return json({ error: 'Invalid project name' }, { status: 400 });
	}

	// Start PM2 process
	try {
		const exitCode = await new Promise<number>((resolve) => {
			const proc = spawn('pm2', ['start', ecosystemFile, '--update-env', '--name', sanitizedName], {
				cwd: targetPath,
				shell: false,
				env: { ...process.env },
			});

			proc.on('close', (code) => resolve(code ?? 1));
			proc.on('error', () => resolve(1));
		});

		if (exitCode !== 0) {
			return json({ error: `PM2 start failed with exit code ${exitCode}` }, { status: 500 });
		}

		logger.info('PM2 process started from DB project', {
			userId: session.user.id,
			projectName: sanitizedName,
			targetPath,
			ecosystemFile,
		});

		return json({ success: true, message: `Process "${sanitizedName}" started successfully` });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to start PM2 process', {
			userId: session.user.id,
			projectName: sanitizedName,
			targetPath,
			errorMessage,
		});
		return json({ error: `Failed to start process: ${errorMessage}` }, { status: 500 });
	}
};
