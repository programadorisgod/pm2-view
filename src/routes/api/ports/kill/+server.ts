import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { adminHandler } from '$lib/server/admin-handler';
import { rateLimiter } from '$lib/rate-limiter';
import { PortOtpService } from '$lib/ports';

const killRequestSchema = z.object({
	port: z.number().int().min(1).max(65535),
	pid: z.number().int().min(1).nullable().optional(),
	processName: z.string().nullable().optional()
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
	const validation = killRequestSchema.safeParse(body);

	if (!validation.success) {
		const msg = validation.error.issues[0]?.message ?? 'Invalid input';
		return json({ error: msg }, { status: 400 });
	}

	const { port, pid, processName } = validation.data;

	if (!user.email) {
		return json({ error: 'User email not found' }, { status: 400 });
	}

	const otpService = new PortOtpService();
	const code = otpService.generate(user.id, port, pid ?? null, processName ?? null);

	const sent = await otpService.sendCode(user.email, code, port, processName ?? null);

	if (!sent) {
		return json(
			{ error: 'Failed to send verification email. Check SMTP configuration.' },
			{ status: 500 }
		);
	}

	return json({
		success: true,
		message: `Verification code sent to ${user.email}`,
		port,
		processName: processName ?? null
	});
});
