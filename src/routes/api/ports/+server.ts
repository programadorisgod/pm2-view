import { json } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { rateLimiter } from '$lib/rate-limiter';
import { PortManagerService } from '$lib/ports';

export const GET = adminHandler(async ({ getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);

	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	const service = new PortManagerService();
	const { ports, summary } = await service.getPorts();
	return json({ ports, summary });
});
