<script lang="ts">
	import { authClient } from '$lib/auth/client';
	import { z } from 'zod';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let errors = $state<{ name?: string; email?: string; password?: string; confirmPassword?: string; general?: string }>({});
	let loading = $state(false);

	const registerSchema = z.object({
		name: z.string().min(2, 'Name must be at least 2 characters'),
		email: z.string().email('Please enter a valid email address'),
		password: z.string().min(8, 'Password must be at least 8 characters'),
		confirmPassword: z.string().min(1, 'Please confirm your password')
	}).refine((data) => {
		if (data.password !== data.confirmPassword) {
			return { success: false, error: { issues: [{ path: ['confirmPassword'], message: 'Passwords do not match' }] } };
		}
		return { success: true };
	});

	async function handleSubmit() {
		errors = {};
		loading = true;

		const result = registerSchema.safeParse({ name, email, password, confirmPassword } as any);

		if (!result.success) {
			const newErrors: typeof errors = {};
			const zodErr = result.error as any;
			for (const e of zodErr.errors) {
				if (e.path[0] === 'name') newErrors.name = e.message;
				if (e.path[0] === 'email') newErrors.email = e.message;
				if (e.path[0] === 'password') newErrors.password = e.message;
				if (e.path[0] === 'confirmPassword') newErrors.confirmPassword = e.message;
			}
			errors = newErrors;
			loading = false;
			return;
		}

		try {
			const signUpResult = await authClient.signUp.email({
				name: result.data.name,
				email: result.data.email,
				password: result.data.password
			});

			if (signUpResult.error) {
				errors = { general: signUpResult.error.message || 'Registration failed' };
			} else {
				// Redirect to login on success
				window.location.href = '/login';
			}
		} catch (err) {
			errors = { general: 'An unexpected error occurred' };
		} finally {
			loading = false;
		}
	}
</script>

<div class="login-container">
	<div class="login-card">
		<div class="login-header">
			<h1 class="login-title">Create Account</h1>
			<p class="login-subtitle">Sign up for your PM2 Dashboard</p>
		</div>

		<form onsubmit={handleSubmit} class="login-form">
			{#if errors.general}
				<div class="error-banner">
					{errors.general}
				</div>
			{/if}

			<div class="form-group">
				<label for="name" class="form-label">Name</label>
				<input
					id="name"
					type="text"
					bind:value={name}
					placeholder="John Doe"
					class="form-input"
					class:input-error={!!errors.name}
					autocomplete="name"
				/>
				{#if errors.name}
					<span class="field-error">{errors.name}</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="email" class="form-label">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					class="form-input"
					class:input-error={!!errors.email}
					autocomplete="email"
				/>
				{#if errors.email}
					<span class="field-error">{errors.email}</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="password" class="form-label">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					placeholder="••••••••"
					class="form-input"
					class:input-error={!!errors.password}
					autocomplete="new-password"
				/>
				{#if errors.password}
					<span class="field-error">{errors.password}</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="confirmPassword" class="form-label">Confirm Password</label>
				<input
					id="confirmPassword"
					type="password"
					bind:value={confirmPassword}
					placeholder="••••••••"
					class="form-input"
					class:input-error={!!errors.confirmPassword}
					autocomplete="new-password"
				/>
				{#if errors.confirmPassword}
					<span class="field-error">{errors.confirmPassword}</span>
				{/if}
			</div>

			<button type="submit" disabled={loading} class="submit-button">
				{loading ? 'Creating Account...' : 'Sign Up'}
			</button>
		</form>

		<div class="login-footer">
			<p>Already have an account? <a href="/login" class="login-link">Sign In</a></p>
		</div>
	</div>
</div>

<style>
	.login-container {
		width: 100%;
		max-width: 400px;
	}

	.login-card {
		background: #ffffff;
		border-radius: 18px;
		padding: 48px 32px;
		box-shadow: rgba(0, 0, 0, 0.04) 0px 1px 0px;
		border: 1px solid #e0e0e0;
	}

	.login-header {
		text-align: center;
		margin-bottom: 32px;
	}

	.login-title {
		font-family: 'SF Pro Display', system-ui, -apple-system, sans-serif;
		font-size: 34px;
		font-weight: 600;
		line-height: 1.47;
		letter-spacing: -0.374px;
		color: #1d1d1f;
		margin: 0 0 8px 0;
	}

	.login-subtitle {
		font-family: 'SF Pro Text', system-ui, -apple-system, sans-serif;
		font-size: 17px;
		font-weight: 400;
		line-height: 1.47;
		letter-spacing: -0.374px;
		color: #7a7a7a;
		margin: 0;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 17px;
	}

	.error-banner {
		background: #fff5f5;
		color: #c53030;
		padding: 12px 16px;
		border-radius: 8px;
		font-family: 'SF Pro Text', system-ui, -apple-system, sans-serif;
		font-size: 14px;
		line-height: 1.43;
		letter-spacing: -0.224px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.form-label {
		font-family: 'SF Pro Text', system-ui, -apple-system, sans-serif;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.29;
		letter-spacing: -0.224px;
		color: #1d1d1f;
	}

	.form-input {
		font-family: 'SF Pro Text', system-ui, -apple-system, sans-serif;
		font-size: 17px;
		font-weight: 400;
		line-height: 1.47;
		letter-spacing: -0.374px;
		color: #1d1d1f;
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 9999px;
		padding: 12px 20px;
		height: 44px;
		transition: border-color 0.2s ease;
		outline: none;
		box-sizing: border-box;
		width: 100%;
	}

	.form-input:focus {
		border-color: #0066cc;
		box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
	}

	.form-input.input-error {
		border-color: #c53030;
	}

	.field-error {
		font-family: 'SF Pro Text', system-ui, -apple-system, sans-serif;
		font-size: 12px;
		font-weight: 400;
		line-height: 1.3;
		letter-spacing: -0.08px;
		color: #c53030;
		padding-left: 4px;
	}

	.submit-button {
		font-family: 'SF Pro Text', system-ui, -apple-system, sans-serif;
		font-size: 18px;
		font-weight: 300;
		line-height: 1.0;
		letter-spacing: 0;
		color: #ffffff;
		background: #0066cc;
		border: none;
		border-radius: 9999px;
		padding: 14px 28px;
		cursor: pointer;
		transition: transform 0.1s ease;
		margin-top: 8px;
	}

	.submit-button:hover:not(:disabled) {
		background: #0066cc;
	}

	.submit-button:active:not(:disabled) {
		transform: scale(0.95);
	}

	.submit-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.login-footer {
		text-align: center;
		margin-top: 24px;
		font-family: 'SF Pro Text', system-ui, -apple-system, sans-serif;
		font-size: 14px;
		color: #7a7a7a;
	}

	.login-link {
		color: #0066cc;
		text-decoration: none;
		font-weight: 400;
	}

	.login-link:hover {
		text-decoration: underline;
	}
</style>
