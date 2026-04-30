<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { Sidebar } from '$lib/ui/components';

	let {
		children
	}: {
		children?: import('svelte').Snippet;
	} = $props();

	let navItems = $derived([
		{ label: 'Users', href: `${base}/admin/users`, active: page.url.pathname === `${base}/admin/users` },
		{ label: 'Teams', href: `${base}/admin/teams`, active: page.url.pathname.startsWith(`${base}/admin/teams`) },
		{ label: 'Audit Logs', href: `${base}/admin/audit`, active: page.url.pathname === `${base}/admin/audit` },
		{ label: 'Roles', href: `${base}/admin/roles`, active: page.url.pathname === `${base}/admin/roles` }
	]);
</script>

<div class="flex h-screen overflow-hidden" style="background: var(--bg-base);">
	<!-- Sidebar -->
	<div class="hidden lg:block lg:relative lg:z-auto">
		<Sidebar items={navItems} collapsed={false} />
	</div>

	<!-- Main content -->
	<main class="flex-1 overflow-y-auto p-lg lg:p-xl">
		{@render children?.()}
	</main>
</div>
