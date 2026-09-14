<script lang="ts">
	import { base } from '$app/paths';
	import Button from '$lib/ui/components/button.svelte';
	import Badge from '$lib/ui/components/badge.svelte';
	import type { AuthUser } from '$lib/auth/provider.interface';

	let {
		users = [],
		pagination = { page: 1, limit: 20, total: 0, totalPages: 0 },
		onrolechange,
		onrequestban,
		onrequestunban,
		onrequestdelete
	}: {
		users: (AuthUser & { createdAt?: Date | string })[];
		pagination?: { page: number; limit: number; total: number; totalPages: number };
		onrolechange?: (userId: string, newRole: string) => void;
		onrequestban?: (user: AuthUser) => void;
		onrequestunban?: (user: AuthUser) => void;
		onrequestdelete?: (user: AuthUser) => void;
	} = $props();

	let search = $state('');
	let selectedRole = $state('');

	let filteredUsers = $derived(
		users.filter(u => {
			const matchesRole = !selectedRole || u.role === selectedRole;
			const matchesSearch = !search ||
				(u.name && u.name.toLowerCase().includes(search.toLowerCase())) ||
				u.email.toLowerCase().includes(search.toLowerCase());
			return matchesRole && matchesSearch;
		})
	);

	function handleRoleChange(userId: string, event: Event) {
		const select = event.target as HTMLSelectElement;
		onrolechange?.(userId, select.value);
	}

	function getInitials(name?: string | null, email?: string): string {
		if (name && name.trim()) {
			const parts = name.trim().split(/\s+/);
			if (parts.length >= 2) {
				return (parts[0][0] + parts[1][0]).toUpperCase();
			}
			return name.slice(0, 2).toUpperCase();
		}
		if (email) {
			return email.slice(0, 2).toUpperCase();
		}
		return '??';
	}
</script>

<div class="space-y-md">
	<!-- Search and filter toolbar -->
	<div class="flex flex-col sm:flex-row gap-md items-stretch sm:items-center justify-between">
		<div class="relative flex-1 max-w-md">
			<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style="color: var(--text-muted);">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
				</svg>
			</div>
			<input
				type="text"
				placeholder="Search by name or email..."
				bind:value={search}
				class="input-base w-full pl-9 pr-4 h-10 text-body-sm"
			/>
		</div>

		<div class="flex items-center gap-sm">
			<label for="role-filter" class="text-caption font-medium whitespace-nowrap" style="color: var(--text-secondary);">Filter Role:</label>
			<select
				id="role-filter"
				bind:value={selectedRole}
				class="input-base h-10 px-3 text-body-sm min-w-[130px]"
			>
				<option value="">All Roles</option>
				<option value="admin">Admin</option>
				<option value="user">User</option>
				<option value="viewer">Viewer</option>
			</select>
		</div>
	</div>

	<!-- Table Container -->
	<div class="card-base rounded-xl overflow-hidden border" style="border-color: var(--border-color); background: var(--bg-surface);">
		<div class="overflow-x-auto">
			<table class="w-full text-left border-collapse">
				<thead>
					<tr class="text-caption font-semibold uppercase tracking-wider" style="color: var(--text-secondary); background: var(--bg-base);">
						<th class="py-3.5 px-4">User</th>
						<th class="py-3.5 px-4">Email</th>
						<th class="py-3.5 px-4">Role</th>
						<th class="py-3.5 px-4">Status</th>
						<th class="py-3.5 px-4">Joined</th>
						<th class="py-3.5 px-4 text-right">Actions</th>
					</tr>
				</thead>
				<tbody class="text-body-sm">
					{#each filteredUsers as user (user.id)}
						<tr class="transition-colors hover:bg-[var(--bg-card)]">
							<!-- User Avatar + Name -->
							<td class="py-3.5 px-4">
								<div class="flex items-center gap-3">
									<div
										class="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-caption shrink-0 border"
										style="background: {user.role === 'admin' ? 'rgba(0, 112, 243, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; color: {user.role === 'admin' ? '#0070F3' : 'var(--text-primary)'}; border-color: var(--border-color);"
									>
										{getInitials(user.name, user.email)}
									</div>
									<div class="font-medium" style="color: var(--text-primary);">
										{user.name || 'Anonymous User'}
									</div>
								</div>
							</td>

							<!-- Email -->
							<td class="py-3.5 px-4 font-mono text-caption" style="color: var(--text-secondary);">
								{user.email}
							</td>

							<!-- Role Selector -->
							<td class="py-3.5 px-4">
								<select
									value={user.role || 'user'}
									onchange={(e) => handleRoleChange(user.id, e)}
									class="px-2.5 py-1 rounded-md text-caption font-medium border cursor-pointer transition-colors focus:outline-none"
									style="background: var(--bg-card); border-color: var(--border-color); color: {user.role === 'admin' ? '#0070F3' : 'var(--text-primary)'};"
								>
									<option value="admin">Admin</option>
									<option value="user">User</option>
									<option value="viewer">Viewer</option>
								</select>
							</td>

							<!-- Status (Active / Banned) -->
							<td class="py-3.5 px-4">
								{#if user.banned}
									<Badge variant="error">Banned</Badge>
								{:else}
									<Badge variant="online">Active</Badge>
								{/if}
							</td>

							<!-- Created Date -->
							<td class="py-3.5 px-4 text-caption" style="color: var(--text-muted);">
								{user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
							</td>

							<!-- Actions -->
							<td class="py-3.5 px-4 text-right">
								<div class="flex items-center justify-end gap-2">
									{#if user.banned}
										<Button
											variant="secondary"
											size="xs"
											onclick={() => onrequestunban?.(user)}
										>
											Unban
										</Button>
									{:else}
										<Button
											variant="secondary"
											size="xs"
											onclick={() => onrequestban?.(user)}
										>
											Ban
										</Button>
									{/if}
									<Button
										variant="danger"
										size="xs"
										onclick={() => onrequestdelete?.(user)}
									>
										Delete
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if filteredUsers.length === 0}
				<div class="text-center py-16" style="color: var(--text-muted);">
					<svg class="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
					</svg>
					<p class="text-body-sm">No users found matching your criteria</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Pagination -->
	{#if pagination.totalPages > 1}
		<div class="flex items-center justify-between pt-2">
			<span class="text-caption" style="color: var(--text-muted);">
				Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
			</span>
			<div class="flex items-center gap-1.5">
				{#each Array(pagination.totalPages) as _, i}
					<a
						href="{base}/admin/users?page={i + 1}"
						class="w-8 h-8 rounded-md flex items-center justify-center text-caption font-medium border transition-colors"
						style="background: {pagination.page === i + 1 ? 'var(--primary-color, #0070F3)' : 'var(--bg-surface)'}; color: {pagination.page === i + 1 ? '#FFFFFF' : 'var(--text-primary)'}; border-color: var(--border-color);"
					>
						{i + 1}
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>
