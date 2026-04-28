import { base } from '$app/paths';
import { auth } from '$lib/auth';
import { z } from 'zod';
import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

const loginSchema = z.object({
	email: z.string().email('Invalid email address'),
	password: z.string().min(1, 'Password is required')
});

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;

		const result = loginSchema.safeParse({ email, password });

		if (!result.success) {
			const errors: Record<string, string> = {};
			const zodError = result.error as any;
			for (const err of zodError.errors) {
				if (err.path && err.path[0]) {
					errors[err.path[0].toString()] = err.message;
				}
			}
			return fail(400, {
				error: 'Validation failed',
				errors,
				email
			});
		}

		try {
			const signInResult = await auth.api.signInEmail({
				body: {
					email: result.data.email,
					password: result.data.password
				},
				headers: new Headers()
			}) as any;

			if (!signInResult || !signInResult.user) {
				return fail(401, {
					error: 'Invalid email or password',
					email
				});
			}

			throw redirect(303, `${base}/`);
		} catch (error) {
			if (error instanceof Response && error.status >= 300 && error.status < 400) {
				throw error;
			}

			console.error('Login error:', error);
			return fail(500, {
				error: 'An unexpected error occurred',
				email
			});
		}
	}
};
