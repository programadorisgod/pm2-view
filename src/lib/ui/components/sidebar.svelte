<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';
	import { fade } from 'svelte/transition';

	let {
		items = [],
		collapsed = false,
		class: className = ''
	}: {
		items?: Array<{ label: string; href: string; icon?: string; active?: boolean }>;
		collapsed?: boolean;
		class?: string;
	} = $props();
</script>

<aside
	class={cn(
		'bg-canvas border-r border-hairline h-screen flex flex-col transition-all duration-300',
		collapsed ? 'w-0 overflow-hidden opacity-0' : 'w-64 opacity-100',
		className
	)}
	transition:fade={{ duration: 200 }}
>
	<nav class="flex-1 py-md">
		<ul class="space-y-1 px-sm">
			{#each items as item (item.href)}
				<li>
					<a
						href={item.href}
						class={cn(
							'flex items-center gap-3 px-md py-2 rounded-md text-body transition-colors',
							item.active
								? 'bg-action-blue/10 text-action-blue font-medium'
								: 'text-ink hover:bg-canvas-parchment'
						)}
					>
						{#if item.icon}
							<span class="w-5 h-5 flex items-center justify-center">{@html item.icon}</span>
						{/if}
						<span>{item.label}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</aside>
