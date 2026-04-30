<script lang="ts">
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import UserTable from '$lib/components/admin/user-table.svelte';

	let { data }: { data: PageData } = $props();

	const initialUsers = data.users || [];
	let users = $state(initialUsers);
	let pagination = $derived(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });

	async function handleRoleChange(userId: string, newRole: string) {
		const res = await fetch(`${base}/admin/users/${userId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role: newRole })
		});
		if (res.ok) {
			users = users.map(u => u.id === userId ? { ...u, role: newRole } : u);
		} else {
			const errorData = await res.json().catch(() => null);
			alert(`Failed to update role: ${errorData?.message || res.statusText}`);
		}
	}

	async function handleBan(userId: string, reason?: string) {
		const user = users.find(u => u.id === userId);
		if (!user) return;

		const res = await fetch(`${base}/admin/users/${userId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ banned: !user.banned, banReason: reason })
		});
		if (res.ok) {
			users = users.map(u => u.id === userId ? { ...u, banned: !u.banned } : u);
		} else {
			alert('Failed to update ban status');
		}
	}
</script>

<div class="max-w-6xl mx-auto">
	<div class="mb-xl">
		<h1 class="text-h1 font-bold mb-xs" style="color: var(--text-primary);">Users</h1>
		<p class="text-body-sm" style="color: var(--text-secondary);">Manage user accounts, roles, and permissions</p>
	</div>

	<UserTable {users} {pagination} onrolechange={handleRoleChange} onban={handleBan} />
</div>
