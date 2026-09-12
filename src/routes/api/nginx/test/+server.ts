import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { adminHandler } from '$lib/server/admin-handler';
import { rateLimiter } from '$lib/rate-limiter';
import { NginxService } from '$lib/nginx/nginx.service';

const testSchema = z.object({
	password: z.string().optional()
});

export const POST = adminHandler(async ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);
	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Demasiadas solicitudes. Por favor intenta más tarde.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	try {
		let password: string | undefined;
		try {
			const body = await request.json();
			const parsed = testSchema.safeParse(body);
			if (parsed.success) {
				password = parsed.data.password;
			}
		} catch {
			// Body is optional
		}

		const service = new NginxService();
		const result = await service.testConfig(password);

		return json({
			success: result.ok,
			output: result.output,
			exitCode: result.exitCode
		});
	} catch (err: any) {
		return json({ error: err.message || 'Error al ejecutar prueba de Nginx' }, { status: 500 });
	}
});
