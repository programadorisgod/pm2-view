import { auth } from '$lib/auth';
import { rateLimiter } from '$lib/rate-limiter';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/logger';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);

	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	try {
		await auth.api.signOut({
			headers: request.headers
		});
	} catch (error) {
		logger.error('Logout error:', { error: String(error) });
	}

	return json({ success: true });
};
