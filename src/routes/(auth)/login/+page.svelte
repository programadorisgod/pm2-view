	<script lang="ts">
	import { authClient } from '$lib/auth/client';
	import { base } from '$app/paths';

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
				window.location.href = '/';
			}
		} catch {
			error = 'An unexpected error occurred';
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center p-lg" style="background: var(--bg-base);">
	<!-- Background grid -->
	<div class="fixed inset-0 opacity-30 bg-grid pointer-events-none"></div>

	<div class="w-full max-w-sm relative z-10">
		<!-- Logo -->
		<div class="flex items-center justify-center gap-2.5 mb-2xl">
			<div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: linear-gradient(135deg, #38CDFF, #009DCD); box-shadow: 0 0 20px rgba(56, 205, 255, 0.3);">
				<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
				</svg>
			</div>
			<span class="text-h1 font-bold ">PM2 View</span>
		</div>

		<div class="card-base rounded-xl p-xl">
			<div class="text-center mb-lg">
				<h1 class="text-h2 font-semibold mb-xs" style="color: var(--text-primary);">Welcome Back</h1>
				<p class="text-body-sm" style="color: var(--text-secondary);">Sign in to your dashboard</p>
			</div>

			<form onsubmit={handleSubmit} class="space-y-md">
				{#if error}
					<div class="rounded-md p-sm text-body-sm" style="background: rgba(255, 82, 82, 0.1); color: #FF5252; border: 1px solid rgba(255, 82, 82, 0.2);">
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

				<div>
					<label for="password" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">Password</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="••••••••"
						class="input-base w-full h-10 px-md text-body-sm"
						autocomplete="current-password"
						required
					/>
				</div>

				<button type="submit" disabled={loading} class="btn-primary w-full h-10 text-body-sm font-medium">
					{loading ? 'Signing in...' : 'Sign In'}
				</button>
			</form>

			<div class="text-center mt-lg">
				<p class="text-caption" style="color: var(--text-muted);">
					Don't have an account?
					<a href="{base}/register" class="font-medium" style="color: #38CDFF;">Sign Up</a>
				</p>
			</div>
		</div>
	</div>
</div>
