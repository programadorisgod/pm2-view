<script lang="ts">
	import { base } from '$app/paths';
	import Button from '$lib/ui/components/button.svelte';
	import Badge from '$lib/ui/components/badge.svelte';
	import type { AuthUser } from '$lib/auth/provider.interface';

	let {
		users = [],
		pagination = { page: 1, limit: 20, total: 0, totalPages: 0 },
		onrolechange,
		onban
	}: {
		users: (AuthUser & { createdAt: string })[];
		pagination?: { page: number; limit: number; total: number; totalPages: number };
		onrolechange?: (userId: string, newRole: string) => void;
		onban?: (userId: string, reason?: string) => void;
	} = $props();

	let search = $state('');
	let selectedRole = $state('');

	function handleRoleChange(userId: string, event: Event) {
		const select = event.target as HTMLSelectElement;
		onrolechange?.(userId, select.value);
	}

	function handleBan(userId: string, banned: boolean) {
		if (banned) {
			onban?.(userId);
		} else {
			const reason = prompt('Ban reason:');
			onban?.(userId, reason || 'No reason provided');
		}
	}

	function getRoleVariant(role: string) {
		switch (role) {
			case 'admin': return 'error';
			case 'user': return 'online';
			case 'viewer': return 'offline';
			default: return 'stopped';
		}
	}
</script>

<div class="space-y-md">
	<!-- Search and filters -->
	<div class="flex gap-md items-center">
		<input
			type="text"
			placeholder="Search users..."
			bind:value={search}
			class="flex-1 px-4 py-2 rounded-md border text-body-sm"
			style="background: var(--bg-surface); border-color: var(--border-color); color: var(--text-primary);"
		/>
		<select
			bind:value={selectedRole}
			class="px-4 py-2 rounded-md border text-body-sm"
			style="background: var(--bg-surface); border-color: var(--border-color); color: var(--text-primary);"
		>
			<option value="">All Roles</option>
			<option value="admin">Admin</option>
			<option value="user">User</option>
			<option value="viewer">Viewer</option>
		</select>
	</div>

	<!-- Table -->
	<div class="overflow-x-auto" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 0.5rem;">
		<table class="w-full text-body-sm">
			<thead>
				<tr style="border-bottom: 1px solid var(--border-color);">
					<th class="text-left p-3" style="color: var(--text-secondary);">Name</th>
					<th class="text-left p-3" style="color: var(--text-secondary);">Email</th>
					<th class="text-left p-3" style="color: var(--text-secondary);">Role</th>
					<th class="text-left p-3" style="color: var(--text-secondary);">Status</th>
					<th class="text-left p-3" style="color: var(--text-secondary);">Created</th>
					<th class="text-right p-3" style="color: var(--text-secondary);">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each users as user (user.id)}
					<tr style="border-bottom: 1px solid var(--border-color);" class="hover:bg-[var(--bg-card)]">
						<td class="p-3" style="color: var(--text-primary);">{user.name || 'N/A'}</td>
						<td class="p-3" style="color: var(--text-secondary);">{user.email}</td>
						<td class="p-3">
							<select
								value={user.role || 'user'}
								onchange={(e) => handleRoleChange(user.id, e)}
								class="px-2 py-1 rounded text-caption border"
								style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
							>
								<option value="admin">Admin</option>
								<option value="user">User</option>
								<option value="viewer">Viewer</option>
							</select>
						</td>
						<td class="p-3">
							<Badge variant={getRoleVariant(user.role || 'user')}>
								{user.role || 'user'}
							</Badge>
							{#if user.banned}
								<Badge variant="error" class="ml-1">Banned</Badge>
							{/if}
						</td>
						<td class="p-3" style="color: var(--text-muted);">
							{new Date(user.createdAt).toLocaleDateString()}
						</td>
						<td class="p-3 text-right">
							<Button
								variant={user.banned ? 'secondary' : 'danger'}
								size="xs"
								onclick={() => handleBan(user.id, user.banned)}
							>
								{user.banned ? 'Unban' : 'Ban'}
							</Button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if users.length === 0}
			<div class="text-center py-2xl" style="color: var(--text-muted);">
				No users found
			</div>
		{/if}
	</div>

	<!-- Pagination -->
	{#if pagination.totalPages > 1}
		<div class="flex justify-center gap-2">
			{#each Array(pagination.totalPages) as _, i}
				<a
					href="{base}/admin/users?page={i + 1}"
					class="px-3 py-1 rounded text-caption"
					style="background: {pagination.page === i + 1 ? 'var(--bg-card)' : 'transparent'}; color: var(--text-primary);"
				>
					{i + 1}
				</a>
			{/each}
		</div>
	{/if}
</div>
