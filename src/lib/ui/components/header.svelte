<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';
	import { theme } from '$lib/theme.svelte';

	let {
		title = 'PM2 View',
		class: className = '',
		actions
	}: {
		title?: string;
		class?: string;
		actions?: import('svelte').Snippet;
	} = $props();
</script>

<header
	class={cn(
		'sticky top-0 z-50 flex items-center justify-between px-lg h-[52px]',
		className
	)}
	style="background: var(--glass-bg); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border-color);"
>
	<div class="flex items-center gap-md">
		<h2 class="text-h3 font-semibold" style="color: var(--text-primary);">{title}</h2>
	</div>

	{#if actions}
		<div class="flex items-center gap-sm">
			{@render actions()}
		</div>
	{/if}
</header>
