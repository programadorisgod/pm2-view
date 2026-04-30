	<script lang="ts">
	import { Header, Sidebar } from '$lib/ui/components';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { theme } from '$lib/theme.svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children?: import('svelte').Snippet; data: LayoutData } = $props();

	let mobileMenuOpen = $state(false);
	let userMenuOpen = $state(false);

	let user = $derived(data.user);
	let isAdmin = $derived(user?.role === 'admin');
	let initials = $derived(user ? (user.name || user.email).substring(0, 2).toUpperCase() : '');
	let adminExpanded = $derived(page.url.pathname.startsWith(`${base}/admin`));

	let navItems = $derived([
		{ label: 'Dashboard', href: `${base}/`, active: page.url.pathname === base || page.url.pathname === base + '/' },
		{ label: 'Projects', href: `${base}/projects`, active: page.url.pathname.startsWith(`${base}/projects`) && !page.url.pathname.includes('/sharing') },
		{ label: 'Teams', href: `${base}/teams`, active: page.url.pathname.startsWith(`${base}/teams`) },
		{ label: 'Metrics', href: `${base}/metrics`, active: page.url.pathname === `${base}/metrics` },
		...(isAdmin ? [
			{
				label: 'Admin',
				href: `${base}/admin`,
				active: page.url.pathname.startsWith(`${base}/admin`),
				expanded: adminExpanded,
				children: [
					{ label: 'Users', href: `${base}/admin/users`, active: page.url.pathname === `${base}/admin/users` },
					{ label: 'Teams', href: `${base}/admin/teams`, active: page.url.pathname.startsWith(`${base}/admin/teams`) },
					{ label: 'Audit Logs', href: `${base}/admin/audit`, active: page.url.pathname === `${base}/admin/audit` },
					{ label: 'Roles', href: `${base}/admin/roles`, active: page.url.pathname === `${base}/admin/roles` }
				]
			}
		] : [])
	]);

	async function handleLogout() {
		userMenuOpen = false;
		try {
			await fetch(`${base}/api/logout`, { method: 'POST' });
			goto(`${base}/login`);
		} catch (err) {
			console.error('Logout failed:', err);
		}
	}
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
						<!-- User menu -->
						<div class="relative">
							<button
								class="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors hover:bg-[var(--bg-card)]"
								onclick={() => (userMenuOpen = !userMenuOpen)}
								aria-label="User menu"
							>
								<!-- Avatar -->
								<div
									class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
									style="background: linear-gradient(135deg, #38CDFF, #009DCD); color: white;"
								>
									{initials}
								</div>
								<span class="text-body-sm font-medium hidden sm:inline" style="color: var(--text-primary);">
									{user.name || user.email}
								</span>
								<svg class="w-3 h-3 transition-transform" style="color: var(--text-secondary);" style:transform={userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
								</svg>
							</button>

							<!-- Dropdown -->
							{#if userMenuOpen}
								<div
									class="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-lg overflow-hidden z-50"
									style="background: var(--bg-surface); border: 1px solid var(--border-color);"
								>
									<!-- User info -->
									<div class="px-3 py-2.5 border-b" style="border-color: var(--border-color);">
										<p class="text-body-sm font-medium" style="color: var(--text-primary);">{user.name || user.email}</p>
										{#if user.email}
											<p class="text-caption" style="color: var(--text-muted);">{user.email}</p>
										{/if}
										{#if isAdmin}
											<p class="text-caption" style="color: #38CDFF;">Admin</p>
										{/if}
									</div>

									<!-- Logout -->
									<button
										type="button"
										class="w-full flex items-center gap-2 px-3 py-2 text-body-sm transition-colors hover:bg-[var(--bg-card)]"
										style="color: #ff6b6b;"
										onclick={handleLogout}
									>
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
										</svg>
										Cerrar sesión
									</button>
								</div>
							{/if}
						</div>

						<!-- Click outside to close -->
						{#if userMenuOpen}
							<button
								type="button"
								class="fixed inset-0 z-40 w-full h-full"
								onclick={() => (userMenuOpen = false)}
								aria-label="Close user menu"
							></button>
						{/if}
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
