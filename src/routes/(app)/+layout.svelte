<script lang="ts">
	import { Header, Sidebar } from '$lib/ui/components';
	import { page } from '$app/state';
	import { theme } from '$lib/theme.svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children?: import('svelte').Snippet; data: LayoutData } = $props();

	let mobileMenuOpen = $state(false);

	let navItems = $derived([
		{ label: 'Dashboard', href: '/', active: page.url.pathname === '/' },
		{ label: 'Projects', href: '/projects', active: page.url.pathname.startsWith('/projects') },
		{ label: 'Metrics', href: '/metrics', active: page.url.pathname === '/metrics' }
	]);

	let user = $derived(data.user);
</script>

<div class="flex h-screen overflow-hidden" style="background: var(--bg-base);">
	<!-- Mobile sidebar backdrop -->
	{#if mobileMenuOpen}
		<button
			class="fixed inset-0 z-40 lg:hidden"
			style="background: rgba(0,0,0,0.5);"
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
			<Sidebar items={navItems} collapsed={false} class="h-full w-[220px]" />
		</div>
	{/if}

	<!-- Main content area -->
	<div class="flex-1 flex flex-col overflow-hidden">
		<Header title="">
			{#snippet actions()}
				<div class="flex items-center gap-sm">
					<!-- Theme toggle -->
					<button
						class="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
						style="color: var(--text-secondary);"
						onclick={(e) => {
							// Set CSS vars for circular reveal origin
							const rect = (e.target as HTMLElement).getBoundingClientRect();
							document.documentElement.style.setProperty('--x', `${rect.left + rect.width / 2}px`);
							document.documentElement.style.setProperty('--y', `${rect.top + rect.height / 2}px`);
							theme.toggle();
						}}
						aria-label="Toggle theme"
					>
						{#if theme.current === 'dark'}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
							</svg>
						{:else}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
							</svg>
						{/if}
					</button>

					<button class="btn-primary px-4 py-1.5 text-body-sm opacity-40 cursor-not-allowed" disabled>
						Add Project
					</button>

					{#if user}
						<span class="text-caption hidden sm:inline" style="color: var(--text-secondary);">
							{user.name || user.email}
						</span>
					{/if}

					<!-- Mobile menu button -->
					<button
						class="lg:hidden w-8 h-8 rounded-md flex items-center justify-center transition-colors"
						style="color: var(--text-secondary);"
						onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
						aria-label="Toggle menu"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
						</svg>
					</button>
				</div>
			{/snippet}
		</Header>

		<main class="flex-1 overflow-y-auto p-lg lg:p-xl scrollbar-thin page-enter">
			{@render children?.()}
		</main>
	</div>
</div>
