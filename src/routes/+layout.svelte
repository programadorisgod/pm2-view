<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="description" content="PM2 Visual Dashboard - Monitor and manage your PM2 processes" />
</svelte:head>

<div class="min-h-screen bg-canvas text-ink antialiased">
	{@render children()}
</div>
