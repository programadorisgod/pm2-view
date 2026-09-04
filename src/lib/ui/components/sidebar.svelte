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
		GitHub: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.301 0h.093c2.242 0 4.34.613 6.137 1.68l-.055-.031c1.871 1.094 3.386 2.609 4.449 4.422l.031.058c1.04 1.769 1.654 3.896 1.654 6.166 0 5.406-3.483 10-8.327 11.658l-.087.026c-.063.02-.135.031-.209.031-.162 0-.312-.054-.433-.144l.002.001c-.128-.115-.208-.281-.208-.466 0-.005 0-.01 0-.014v.001q0-.048.008-1.226t.008-2.154c.007-.075.011-.161.011-.249 0-.792-.323-1.508-.844-2.025.618-.061 1.176-.163 1.718-.305l-.076.017c.573-.16 1.073-.373 1.537-.642l-.031.017c.508-.28.938-.636 1.292-1.058l.006-.007c.372-.476.663-1.036.84-1.645l.009-.035c.209-.683.329-1.468.329-2.281 0-.045 0-.091-.001-.136v.007c0-.022.001-.047.001-.072 0-1.248-.482-2.383-1.269-3.23l.003.003c.168-.44.265-.948.265-1.479 0-.649-.145-1.263-.404-1.814l.011.026c-.115-.022-.246-.035-.381-.035-.334 0-.649.078-.929.216l.012-.005c-.568.21-1.054.448-1.512.726l.038-.022-.609.384c-.922-.264-1.981-.416-3.075-.416s-2.153.152-3.157.436l.081-.02q-.256-.176-.681-.433c-.373-.214-.814-.421-1.272-.595l-.066-.022c-.293-.154-.64-.244-1.009-.244-.124 0-.246.01-.364.03l.013-.002c-.248.524-.393 1.139-.393 1.788 0 .531.097 1.04.275 1.509l-.01-.029c-.785.844-1.266 1.979-1.266 3.227 0 .025 0 .051.001.076v-.004c-.001.039-.001.084-.001.13 0 .809.12 1.591.344 2.327l-.015-.057c.189.643.476 1.202.85 1.693l-.009-.013c.354.435.782.793 1.267 1.062l.022.011c.432.252.933.465 1.46.614l.046.011c.466.125 1.024.227 1.595.284l.046.004c-.431.428-.718 1-.784 1.638l-.001.012c-.207.101-.448.183-.699.236l-.021.004c-.256.051-.549.08-.85.08-.022 0-.044 0-.066 0h.003c-.394-.008-.756-.136-1.055-.348l.006.004c-.371-.259-.671-.595-.881-.986l-.007-.015c-.198-.336-.459-.614-.768-.827l-.009-.006c-.225-.169-.49-.301-.776-.38l-.016-.004-.32-.048c-.023-.002-.05-.003-.077-.003-.14 0-.273.028-.394.077l.007-.003q-.128.072-.08.184c.039.086.087.16.145.225l-.001-.001c.061.072.13.135.205.19l.003.002.112.08c.283.148.516.354.693.603l.004.006c.191.237.359.505.494.792l.01.024.16.368c.135.402.38.738.7.981l.005.004c.3.234.662.402 1.057.478l.016.002c.33.064.714.104 1.106.112h.007c.045.002.097.002.15.002.261 0 .517-.021.767-.062l-.027.004.368-.064q0 .609.008 1.418t.008.873v.014c0 .185-.08.351-.208.466h-.001c-.119.089-.268.143-.431.143-.075 0-.147-.011-.214-.032l.005.001c-4.929-1.689-8.409-6.283-8.409-11.69 0-2.268.612-4.393 1.681-6.219l-.032.058c1.094-1.871 2.609-3.386 4.422-4.449l.058-.031c1.739-1.034 3.835-1.645 6.073-1.645h.098-.005z"/></svg>`,
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
	<div class="px-lg flex items-center h-[52px] border-b" style="border-color: var(--border-color);">
		<div class="flex items-center gap-2.5">
			<div class="w-7 h-7 rounded-md flex items-center justify-center" style="background: #0070F3;">
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
								? 'background: rgba(0, 112, 243, 0.08); color: #0070F3;'
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
												? 'background: rgba(0, 112, 243, 0.08); color: #0070F3;'
												: 'color: var(--text-muted);'
											}
										>
											<span class="w-1.5 h-1.5 rounded-full" style={child.active ? 'background: #0070F3;' : 'background: var(--text-muted); opacity: 0.5;'}></span>
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
								? 'background: rgba(0, 112, 243, 0.08); color: #0070F3;'
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
