import { describe, expect, it } from 'vitest';
import { apiOk, apiError, errorMessage } from '$lib/server/containers/api-helpers';

describe('api helpers', () => {
	it('apiOk devuelve una respuesta con ok=true y el mensaje', async () => {
		const res = apiOk('Todo bien');
		const body = (await res.json()) as { ok: boolean; message: string };
		expect(body).toEqual({ ok: true, message: 'Todo bien' });
		expect(res.status).toBe(200);
	});

	it('apiOk admite campos extra', async () => {
		const res = apiOk('Hecho', { count: 3 });
		const body = (await res.json()) as { count: number };
		expect(body.count).toBe(3);
	});

	it('apiError devuelve el estado HTTP y el mensaje de error', async () => {
		const res = apiError(400, 'Entrada no válida');
		const body = (await res.json()) as { ok: boolean; error: string };
		expect(res.status).toBe(400);
		expect(body.ok).toBe(false);
		expect(body.error).toBe('Entrada no válida');
	});

	it('errorMessage extrae el mensaje de un Error', () => {
		expect(errorMessage(new Error('algo falló'))).toBe('algo falló');
	});

	it('errorMessage acota el tamaño del texto', () => {
		const long = 'x'.repeat(500);
		expect(errorMessage(long).length).toBeLessThanOrEqual(300);
	});
});
