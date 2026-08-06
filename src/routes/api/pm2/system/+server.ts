import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { adminHandler } from '$lib/server/admin-handler';
import { rateLimiter } from '$lib/rate-limiter';
import { PM2SystemService } from '$lib/pm2/pm2-system.service';

const applySchema = z.object({
	command: z.string().min(1, 'Command is required'),
	password: z.string()
});

function getZodErrorMessage(result: any): string {
	if (result.success) return '';
	const firstError = result.error?.issues?.[0] || result.issues?.[0];
	return firstError?.message || 'Validation failed';
}

/**
 * Admin-only PM2 daemon operations:
 * - `?action=save`          → runs `pm2 save`
 * - `?action=startup`       → runs `pm2 startup` and returns the sudo command
 * - `?action=apply-startup` → applies the startup command with the sudo password
 *                             (body: { command, password }), streaming NDJSON output
 */
export const POST = adminHandler(async ({ request, url, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);

	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	const action = url.searchParams.get('action');
	const service = new PM2SystemService();

	switch (action) {
		case 'save': {
			const result = await service.save();
			return json({ success: result.ok, output: result.output });
		}

		case 'startup': {
			const result = await service.startup();
			return json({
				success: result.ok,
				output: result.output,
				command: result.command ?? null
			});
		}

		case 'apply-startup': {
			const body = await request.json();
			const validationResult = applySchema.safeParse(body);
			if (!validationResult.success) {
				return json({ error: getZodErrorMessage(validationResult) }, { status: 400 });
			}

			const { command, password } = validationResult.data;
			return streamApplyStartup(service, command, password);
		}

		default:
			return json({ error: 'Invalid action' }, { status: 400 });
	}
});

function streamApplyStartup(
	service: PM2SystemService,
	command: string,
	password: string
): Response {
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;
			const safeEnqueue = (data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
				} catch {
					// Stream already closed, ignore
				}
			};

			try {
				const result = await service.applyStartup(command, password, (line, isError) => {
					safeEnqueue({ line, isError, isComplete: false });
				});

				if (result.ok) {
					safeEnqueue({
						line: 'Startup script applied successfully',
						isError: false,
						isComplete: true,
						success: true
					});
				} else {
					safeEnqueue({
						line: result.error || 'Failed to apply startup script. Check the output above.',
						isError: true,
						isComplete: true,
						success: false
					});
				}
			} catch (err) {
				safeEnqueue({
					line: err instanceof Error ? err.message : 'Failed to apply startup script',
					isError: true,
					isComplete: true,
					success: false
				});
			} finally {
				closed = true;
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}
