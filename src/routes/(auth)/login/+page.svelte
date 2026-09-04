	<script lang="ts">
	import { authClient } from '$lib/auth/client';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import PasswordInput from '$lib/components/PasswordInput.svelte';

	const oauthError = $derived(page.url.searchParams.get('error') || page.url.searchParams.get('oauth_error'));
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);
	let googleLoading = $state(false);

	$effect(() => {
		if (oauthError) {
			if (oauthError === 'session_timeout') {
				error = 'Sign in timed out. Please try again.';
			} else {
				error = `Google sign in failed: ${oauthError.replace(/_/g, ' ')}. Please try again.`;
			}
			return;
		}
		authClient.getSession().then((session) => {
			if (session?.user) {
				window.location.href = `${base}/`;
			}
		});
	});

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
				window.location.href = `${base}/`;
			}
		} catch {
			error = 'An unexpected error occurred';
		} finally {
			loading = false;
		}
	}

	async function handleGoogleSignIn() {
		error = '';
		googleLoading = true;
		try {
			const callbackUrl = `${window.location.origin}${base}/callback`;
			const result = await authClient.signIn.social({
				provider: 'google',
				callbackURL: callbackUrl
			}) as { url?: string };
			if (result.url) {
				window.location.href = result.url;
			}
		} catch {
			error = 'An unexpected error occurred with Google sign in';
		} finally {
			googleLoading = false;
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
			<div class="text-center mb-lg">
				<h1 class="text-h2 font-semibold mb-xs" style="color: var(--text-primary);">Welcome Back</h1>
				<p class="text-body-sm" style="color: var(--text-secondary);">Sign in to your dashboard</p>
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

				<div>
					<label for="password" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">Password</label>
					<PasswordInput
						id="password"
						bind:value={password}
						placeholder="••••••••"
						autocomplete="current-password"
						required
					/>
				</div>

				<div class="flex justify-end -mt-sm">
					<a href="{base}/forgot-password" class="text-caption font-medium" style="color: var(--text-secondary);">Forgot password?</a>
				</div>

				<button type="submit" disabled={loading} class="btn-primary w-full h-10 text-body-sm font-medium">
					{loading ? 'Signing in...' : 'Sign In'}
				</button>
			</form>

			<div class="relative my-lg">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t" style="border-color: var(--border-color);"></div>
				</div>
				<div class="relative flex justify-center text-caption" style="color: var(--text-muted);">
					<span class="px-sm" style="background: var(--bg-surface);">or</span>
				</div>
			</div>

			<button
				type="button"
				disabled={googleLoading}
				onclick={handleGoogleSignIn}
				class="w-full h-10 rounded-md text-body-sm font-medium flex items-center justify-center gap-sm"
				style="background: #fff; color: #3c4043; border: 1px solid #dadce0;"
			>
				{#if googleLoading}
					Signing in...
				{:else}
					<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
						<path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
						<path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
						<path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
					</svg>
					Sign in with Google
				{/if}
			</button>

			<div class="text-center mt-lg">
				<p class="text-caption" style="color: var(--text-muted);">
					Don't have an account?
					<a href="{base}/register" class="font-medium" style="color: #0070F3;">Sign Up</a>
				</p>
			</div>
		</div>
	</div>
</div>
