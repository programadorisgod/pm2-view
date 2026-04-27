<script lang="ts">
	import { Header, Sidebar } from '$lib/ui/components';
	import type { LayoutData } from './$types';

	let { children, data }: { children?: import('svelte').Snippet; data: LayoutData } = $props();

	let mobileMenuOpen = $state(false);

	let navItems = [
		{ label: 'Dashboard', href: '/', active: false },
		{ label: 'Projects', href: '/projects', active: false },
		{ label: 'Metrics', href: '/metrics', active: false }
	];

	let user = $derived(data.user);
</script>

<div class="flex h-screen overflow-hidden">
	<!-- Mobile sidebar backdrop -->
	{#if mobileMenuOpen}
		<button
			class="fixed inset-0 bg-black/50 z-40 lg:hidden"
			onclick={() => (mobileMenuOpen = false)}
			aria-label="Close menu"
		></button>
	{/if}

	<!-- Sidebar -->
	<div class="hidden lg:block lg:relative lg:z-auto">
		<Sidebar items={navItems} collapsed={false} />
	</div>

	<!-- Mobile sidebar -->
	{#if mobileMenuOpen}
		<div class="fixed inset-y-0 left-0 z-50 lg:hidden">
			<Sidebar items={navItems} collapsed={false} class="h-full w-64" />
		</div>
	{/if}

	<!-- Main content area -->
	<div class="flex-1 flex flex-col overflow-hidden">
		<Header title="PM2 View">
			{#snippet actions()}
				<div class="flex items-center gap-md">
					<button class="btn-pill bg-action-blue text-on-primary px-[22px] py-[11px] text-body font-medium opacity-48 cursor-not-allowed" disabled>
						Add Project
					</button>

					{#if user}
						<span class="text-caption text-ink-muted-80 hidden sm:inline">
							{user.name || user.email}
						</span>
					{/if}

					<!-- Mobile menu button -->
					<button
						class="lg:hidden p-2 rounded-md hover:bg-canvas-parchment"
						onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
						aria-label="Toggle menu"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
						</svg>
					</button>
				</div>
			{/snippet}
		</Header>

		<main class="flex-1 overflow-y-auto p-xl lg:p-xxl">
			{@render children?.()}
		</main>
	</div>
</div>
