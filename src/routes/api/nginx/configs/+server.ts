import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { adminHandler } from '$lib/server/admin-handler';
import { rateLimiter } from '$lib/rate-limiter';
import { NginxService } from '$lib/nginx/nginx.service';

const saveSchema = z.object({
	path: z.string().min(1, 'La ruta del archivo es requerida'),
	content: z.string(),
	password: z.string().optional()
});

const createSchema = z.object({
	name: z.string().min(1, 'El nombre es requerido'),
	content: z.string(),
	password: z.string().optional()
});

export const GET = adminHandler(async ({ getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);
	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Demasiadas solicitudes. Por favor intenta más tarde.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	try {
		const service = new NginxService();
		const files = await service.listFiles();
		return json({
			success: true,
			baseDir: service.getBaseDir(),
			files
		});
	} catch (err: any) {
		return json({ error: err.message || 'Error al listar archivos de Nginx' }, { status: 500 });
	}
});

export const POST = adminHandler(async ({ request, url, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);
	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Demasiadas solicitudes. Por favor intenta más tarde.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	const action = url.searchParams.get('action') || 'save';
	const service = new NginxService();

	try {
		const body = await request.json();

		if (action === 'create') {
			const parsed = createSchema.safeParse(body);
			if (!parsed.success) {
				return json({ error: parsed.error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
			}
			const { name, content, password } = parsed.data;
			const result = await service.createAppFile(name, content, password);

			return json({
				success: result.ok,
				error: result.error,
				filename: result.filename,
				testResult: result.testResult
			});
		} else {
			// Save action
			const parsed = saveSchema.safeParse(body);
			if (!parsed.success) {
				return json({ error: parsed.error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
			}
			const { path: filePath, content, password } = parsed.data;
			const result = await service.saveFile(filePath, content, password);

			return json({
				success: result.ok,
				error: result.error,
				testResult: result.testResult
			});
		}
	} catch (err: any) {
		return json({ error: err.message || 'Error al procesar la configuración' }, { status: 500 });
	}
});
