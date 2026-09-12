import { json } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { rateLimiter } from '$lib/rate-limiter';
import { NginxService } from '$lib/nginx/nginx.service';

export const GET = adminHandler(async ({ url, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);
	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Demasiadas solicitudes. Por favor intenta más tarde.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	const filePath = url.searchParams.get('path');
	if (!filePath) {
		return json({ error: 'Ruta no especificada' }, { status: 400 });
	}

	try {
		const service = new NginxService();
		const content = await service.readFile(filePath);
		return json({
			success: true,
			path: filePath,
			content
		});
	} catch (err: any) {
		return json({ error: err.message || 'Error al leer el archivo' }, { status: 500 });
	}
});
