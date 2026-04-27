<script lang="ts">
	import { authClient } from '$lib/auth/client';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		loading = true;

		try {
			const result = await authClient.signIn.email({
				email,
				password
			});

			if (result.error) {
				error = result.error.message || 'Invalid email or password';
			} else {
				// Redirect to dashboard on success
				window.location.href = '/';
			}
		} catch {
			error = 'An unexpected error occurred';
		} finally {
			loading = false;
		}
	}
</script>

<div class="login-container">
	<div class="login-card">
		<div class="login-header">
			<h1 class="login-title">Welcome Back</h1>
			<p class="login-subtitle">Sign in to your PM2 Dashboard</p>
		</div>

		<form onsubmit={handleSubmit} class="login-form">
			{#if error}
				<div class="error-banner">
					{error}
				</div>
			{/if}

			<div class="form-group">
				<label for="email" class="form-label">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					class="form-input"
					autocomplete="email"
					required
				/>
			</div>

			<div class="form-group">
				<label for="password" class="form-label">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					placeholder="••••••••"
					class="form-input"
					autocomplete="current-password"
					required
				/>
			</div>

			<button type="submit" disabled={loading} class="submit-button">
				{loading ? 'Signing in...' : 'Sign In'}
			</button>
		</form>

		<div class="login-footer">
			<p>Don't have an account? <a href="/register" class="login-link">Sign Up</a></p>
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
