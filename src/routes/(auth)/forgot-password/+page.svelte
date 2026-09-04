	<script lang="ts">
	import { authClient } from '$lib/auth/client';
	import { base } from '$app/paths';

	let email = $state('');
	let error = $state('');
	let loading = $state(false);
	let submitted = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		loading = true;

		try {
			const result = await authClient.requestPasswordReset({
				email,
				redirectTo: `${base}/reset-password`
			});

			if (result.error) {
				error = result.error.message || 'Unable to send reset email';
			} else {
				submitted = true;
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
			{#if submitted}
				<div class="text-center">
					<h1 class="text-h2 font-semibold mb-sm" style="color: var(--text-primary);">Check your email</h1>
					<p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
						If an account exists for <span class="font-medium" style="color: var(--text-primary);">{email}</span>, we sent you a link to reset your password.
					</p>
					<a href="{base}/login" class="btn-secondary inline-flex items-center justify-center w-full h-10 text-body-sm font-medium">
						Back to Sign In
					</a>
				</div>
			{:else}
				<div class="text-center mb-lg">
					<h1 class="text-h2 font-semibold mb-xs" style="color: var(--text-primary);">Forgot Password</h1>
					<p class="text-body-sm" style="color: var(--text-secondary);">Enter your email and we'll send you a reset link</p>
				</div>

				<form onsubmit={handleSubmit} class="space-y-md">
					{#if error}
						<div class="rounded-md p-sm text-body-sm" style="background: rgba(255, 91, 79, 0.1); color: #FF5B4F; border: 1px solid rgba(255, 91, 79, 0.2);">
							{error}
						</div>
					{/if}

					<div>
						<label for="email" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">Email</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							placeholder="you@example.com"
							class="input-base w-full h-10 px-md text-body-sm"
							autocomplete="email"
							required
						/>
					</div>

					<button type="submit" disabled={loading} class="btn-primary w-full h-10 text-body-sm font-medium">
						{loading ? 'Sending...' : 'Send Reset Link'}
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
