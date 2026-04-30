<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';

	type NavItem = {
		label: string;
		href: string;
		icon?: string;
		active?: boolean;
		expanded?: boolean;
		children?: NavItem[];
	};

	let {
		items = [],
		collapsed = false,
		class: className = ''
	}: {
		items?: NavItem[];
		collapsed?: boolean;
		class?: string;
	} = $props();

	const icons: Record<string, string> = {
		Dashboard: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/></svg>`,
		Projects: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`,
		Teams: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
		Metrics: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,
		Admin: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`
	};

	let expandedItems = $state<Record<string, boolean>>({});
	let userToggled = $state<Record<string, boolean>>({});

	function toggleExpand(label: string) {
		expandedItems[label] = !expandedItems[label];
		userToggled[label] = true;
	}

	function isExpanded(item: NavItem): boolean {
		// If user explicitly toggled, respect their choice
		if (userToggled[item.label]) {
			return expandedItems[item.label] || false;
		}
		// Otherwise use the derived expanded prop (e.g. auto-expand on admin routes)
		if (item.expanded !== undefined) return item.expanded;
		return expandedItems[item.label] || false;
	}
</script>

<aside
	class={cn(
		'h-screen flex flex-col transition-all duration-300',
		collapsed ? 'w-0 overflow-hidden opacity-0' : 'w-[220px] opacity-100',
		className
	)}
	style="background: var(--bg-surface); border-right: 1px solid var(--border-color);"
>
	<!-- Logo -->
	<div class="px-lg py-4 border-b" style="border-color: var(--border-color);">
		<div class="flex items-center gap-2.5">
			<div class="w-7 h-7 rounded-md flex items-center justify-center" style="background: linear-gradient(135deg, #38CDFF, #009DCD);">
				<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
				</svg>
			</div>
			<span class="text-h3 font-bold ">PM2 View</span>
		</div>
	</div>

	<!-- Nav -->
	<nav class="flex-1 py-sm px-xs">
		<ul class="space-y-1">
			{#each items as item (item.href)}
				<li>
					{#if item.children}
						<!-- Parent item with children -->
						<button
							class={cn(
								'w-full flex items-center justify-between gap-3 px-md py-2 rounded-md text-body-sm transition-all duration-150',
								item.active ? 'font-medium' : 'hover:bg-[var(--bg-card)]'
							)}
							style={item.active
								? 'background: rgba(56, 205, 255, 0.08); color: #38CDFF;'
								: 'color: var(--text-secondary);'
							}
							onclick={() => toggleExpand(item.label)}
						>
							<div class="flex items-center gap-3">
								{@html icons[item.label] || ''}
								<span>{item.label}</span>
							</div>
							<svg
								class="w-3 h-3 transition-transform"
								style="transform: {isExpanded(item) ? 'rotate(180deg)' : 'rotate(0deg)'}"
								fill="none" stroke="currentColor" viewBox="0 0 24 24"
							>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
							</svg>
						</button>

						<!-- Children -->
						{#if isExpanded(item)}
							<ul class="ml-lg mt-1 space-y-1">
								{#each item.children as child (child.href)}
									<li>
										<a
											href={child.href}
											class={cn(
												'flex items-center gap-3 px-md py-1.5 rounded-md text-body-sm transition-all duration-150',
												child.active
													? 'font-medium'
													: 'hover:bg-[var(--bg-card)]'
											)}
											style={child.active
												? 'background: rgba(56, 205, 255, 0.08); color: #38CDFF;'
												: 'color: var(--text-muted);'
											}
										>
											<span class="w-1.5 h-1.5 rounded-full" style={child.active ? 'background: #38CDFF;' : 'background: var(--text-muted); opacity: 0.5;'}></span>
											<span>{child.label}</span>
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<!-- Regular item without children -->
						<a
							href={item.href}
							class={cn(
								'flex items-center gap-3 px-md py-2 rounded-md text-body-sm transition-all duration-150',
								item.active
									? 'font-medium'
									: 'hover:bg-[var(--bg-card)]'
							)}
							style={item.active
								? 'background: rgba(56, 205, 255, 0.08); color: #38CDFF;'
								: 'color: var(--text-secondary);'
							}
						>
							{@html icons[item.label] || ''}
							<span>{item.label}</span>
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	</nav>

	<!-- Bottom -->
	<div class="px-lg py-sm text-center" style="border-top: 1px solid var(--border-color);">
		<p class="text-caption-sm" style="color: var(--text-muted);">v0.1.0</p>
	</div>
</aside>
