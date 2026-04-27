<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';

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
		'sticky top-0 z-50 backdrop-frosted bg-canvas-parchment/80 border-b border-hairline',
		'flex items-center justify-between px-xl h-[64px]',
		className
	)}
>
	<div class="flex items-center gap-md">
		<h1 class="text-display-md tracking-negative-hero font-semibold text-ink">
			{title}
		</h1>
	</div>

	{#if actions}
		<div class="flex items-center gap-md">
			{@render actions()}
		</div>
	{/if}
</header>
