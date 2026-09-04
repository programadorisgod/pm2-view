import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { adminHandler } from '$lib/server/admin-handler';
import { rateLimiter } from '$lib/rate-limiter';
import { PortOtpService, PortManagerService } from '$lib/ports';

const confirmSchema = z.object({
	code: z.string().length(6, 'Code must be 6 digits')
});

export const POST = adminHandler(async ({ request, getClientAddress }, user) => {
	const ip = getClientAddress();
	const rateLimitResult = rateLimiter.check(ip);

	if (!rateLimitResult.allowed) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{ status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } }
		);
	}

	const body = await request.json();
	const validation = confirmSchema.safeParse(body);

	if (!validation.success) {
		const msg = validation.error.issues[0]?.message ?? 'Invalid code';
		return json({ error: msg }, { status: 400 });
	}

	const otpService = new PortOtpService();
	const payload = otpService.verify(user.id, validation.data.code);

	if (!payload) {
		return json(
			{ error: 'Invalid or expired verification code' },
			{ status: 400 }
		);
	}

	const manager = new PortManagerService();

	const result = payload.pid
		? await manager.killByPid(payload.pid, user.id)
		: await manager.killByPort(payload.port, user.id);

	return json({
		success: result.success,
		message: result.message,
		port: payload.port,
		pid: payload.pid,
		processName: payload.processName
	});
});
