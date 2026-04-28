<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { theme } from '$lib/theme.svelte';
	import '../app.css';

	let { children } = $props();

	// Apply theme class on mount
	$effect(() => {
		theme.apply();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="description" content="PM2 Visual Dashboard - Monitor and manage your PM2 processes" />
</svelte:head>

<div class="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] antialiased transition-colors duration-200">
	{@render children()}
</div>
