	<script lang="ts">
	import { authClient } from '$lib/auth/client';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import PasswordInput from '$lib/components/PasswordInput.svelte';

	const token = $derived(page.url.searchParams.get('token') ?? '');
	const invalidToken = $derived(page.url.searchParams.get('error') === 'INVALID_TOKEN');
	const resetSuccess = $derived(page.url.searchParams.get('reset') === 'success');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);
	let success = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (!token) {
			error = 'Invalid or expired reset link';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}

		loading = true;

		try {
			const result = await authClient.resetPassword({
				newPassword: password,
				token
			});

			if (result.error) {
				const code = result.error.code;
				if (code === 'INVALID_TOKEN') {
					error = 'This reset link is invalid or has expired. Please request a new one.';
				} else {
					error = result.error.message || 'Unable to reset password';
				}
			} else {
				success = true;
				if (typeof history !== 'undefined') {
					history.replaceState({}, '', `${base}/reset-password?reset=success`);
				}
			}
		} catch {
			error = 'An unexpected error occurred';
		} finally {
			loading = false;
		}
	}
</script>

<div class="h-screen flex items-center justify-center p-lg overflow-hidden" style="background: var(--bg-base);">
	<!-- Background grid -->
	<div class="fixed inset-0 opacity-30 bg-grid pointer-events-none"></div>

	<div class="w-[480px] relative z-10">
		<!-- Logo -->
		<div class="flex items-center justify-center gap-2.5 mb-2xl">
			<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: #0070F3; box-shadow: 0 0 12px rgba(0, 112, 243, 0.15);">
				<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
				</svg>
			</div>
			<span class="text-h1 font-bold ">PM2 View</span>
		</div>

		<div class="card-base rounded-xl p-xl">
			{#if success || resetSuccess}
				<div class="text-center">
					<h1 class="text-h2 font-semibold mb-sm" style="color: var(--text-primary);">Password reset</h1>
					<p class="text-body-sm mb-lg" style="color: var(--text-secondary);">Your password has been updated. You can now sign in with your new password.</p>
					<a href="{base}/login" class="btn-primary inline-flex items-center justify-center w-full h-10 text-body-sm font-medium">
						Go to Sign In
					</a>
				</div>
			{:else if invalidToken || !token}
				<div class="text-center">
					<h1 class="text-h2 font-semibold mb-sm" style="color: var(--text-primary);">Invalid reset link</h1>
					<p class="text-body-sm mb-lg" style="color: var(--text-secondary);">This reset link is invalid or has expired. Please request a new one.</p>
					<a href="{base}/forgot-password" class="btn-primary inline-flex items-center justify-center w-full h-10 text-body-sm font-medium">
						Request New Link
					</a>
				</div>
			{:else}
				<div class="text-center mb-lg">
					<h1 class="text-h2 font-semibold mb-xs" style="color: var(--text-primary);">Set New Password</h1>
					<p class="text-body-sm" style="color: var(--text-secondary);">Choose a new password for your account</p>
				</div>

				<form onsubmit={handleSubmit} class="space-y-md">
					{#if error}
						<div class="rounded-md p-sm text-body-sm" style="background: rgba(255, 91, 79, 0.1); color: #FF5B4F; border: 1px solid rgba(255, 91, 79, 0.2);">
							{error}
						</div>
					{/if}

					<div>
						<label for="password" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">New Password</label>
						<PasswordInput
							id="password"
							bind:value={password}
							placeholder="••••••••"
							autocomplete="new-password"
							required
						/>
					</div>

					<div>
						<label for="confirmPassword" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">Confirm Password</label>
						<PasswordInput
							id="confirmPassword"
							bind:value={confirmPassword}
							placeholder="••••••••"
							autocomplete="new-password"
							required
						/>
					</div>

					<button type="submit" disabled={loading} class="btn-primary w-full h-10 text-body-sm font-medium">
						{loading ? 'Resetting...' : 'Reset Password'}
					</button>
				</form>

				<div class="text-center mt-lg">
					<p class="text-caption" style="color: var(--text-muted);">
						Remembered your password?
						<a href="{base}/login" class="font-medium" style="color: #0070F3;">Sign In</a>
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
