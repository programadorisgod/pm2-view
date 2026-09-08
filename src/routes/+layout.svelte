<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { theme } from '$lib/theme.svelte';
	import { onNavigate } from '$app/navigation';
	import '../app.css';

	let { children } = $props();

	import { onMount } from 'svelte';

	// Enable View Transitions on page navigation
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		return new Promise((resolve) => {
			document.documentElement.classList.add('page-navigating');
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(() => {
				document.documentElement.classList.remove('page-navigating');
			});
		});
	});

	// Apply theme class on initial mount
	onMount(() => {
		theme.apply();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="description" content="PM2 Visual Dashboard - Monitor and manage your PM2 processes" />
</svelte:head>

<div class="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] antialiased">
	{@render children()}
</div>
