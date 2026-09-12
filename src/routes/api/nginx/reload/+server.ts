import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { adminHandler } from '$lib/server/admin-handler';
import { rateLimiter } from '$lib/rate-limiter';
import { NginxService } from '$lib/nginx/nginx.service';

const reloadSchema = z.object({
	password: z.string().min(1, 'La contraseña de sudo es requerida')
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
		const body = await request.json();
		const parsed = reloadSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message || 'Contraseña requerida' }, { status: 400 });
		}

		const service = new NginxService();
		const result = await service.reloadNginx(parsed.data.password);

		return json({
			success: result.ok,
			output: result.output,
			exitCode: result.exitCode
		});
	} catch (err: any) {
		return json({ error: err.message || 'Error al recargar Nginx' }, { status: 500 });
	}
});
