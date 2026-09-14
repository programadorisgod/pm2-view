<script lang="ts">
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import type { AuthUser } from '$lib/auth/provider.interface';
	import UserTable from '$lib/components/admin/user-table.svelte';
	import PasswordInput from '$lib/components/PasswordInput.svelte';
	import FeedbackBanner from '$lib/ui/components/feedback-banner.svelte';

	let { data }: { data: PageData } = $props();

	let initialUsers = $derived(data.users || []);
	let users = $state<typeof initialUsers>([]);
	let pagination = $derived(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });

	// Feedback notification toast
	let toast = $state<{ type: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);

	function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string) {
		toast = { type, message };
	}

	function dismissToast() {
		toast = null;
	}

	// Create User Modal State
	let showCreateModal = $state(false);
	let newName = $state('');
	let newEmail = $state('');
	let newRole = $state<'admin' | 'user' | 'viewer'>('user');
	let newPassword = $state('');
	let createError = $state('');
	let createLoading = $state(false);

	// Delete Modal State
	let showDeleteModal = $state(false);
	let userToDelete = $state<AuthUser | null>(null);
	let deleteError = $state('');
	let deleteLoading = $state(false);

	// Ban Modal State
	let showBanModal = $state(false);
	let userToBan = $state<AuthUser | null>(null);
	let banReason = $state('');
	let banError = $state('');
	let banLoading = $state(false);

	// Unban Modal State
	let showUnbanModal = $state(false);
	let userToUnban = $state<AuthUser | null>(null);
	let unbanError = $state('');
	let unbanLoading = $state(false);

	$effect(() => {
		users = initialUsers;
	});

	function openCreateModal() {
		newName = '';
		newEmail = '';
		newRole = 'user';
		newPassword = '';
		createError = '';
		createLoading = false;
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
		createError = '';
	}

	async function handleCreateUser(e: Event) {
		e.preventDefault();
		createError = '';

		if (!newEmail || !newEmail.includes('@')) {
			createError = 'A valid email address is required';
			return;
		}

		if (newPassword.length < 8) {
			createError = 'Password must be at least 8 characters';
			return;
		}

		createLoading = true;
		try {
			const res = await fetch(`${base}/admin/users`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newName.trim() || undefined,
					email: newEmail.trim(),
					role: newRole,
					password: newPassword
				})
			});

			const responseData = await res.json().catch(() => null);

			if (!res.ok) {
				createError = responseData?.message || responseData?.error || 'Failed to create user';
				return;
			}

			if (responseData?.user) {
				users = [responseData.user, ...users];
			}
			closeCreateModal();
			showToast('success', `User ${newEmail} created successfully.`);
		} catch {
			createError = 'An unexpected error occurred while creating the user';
		} finally {
			createLoading = false;
		}
	}

	async function handleRoleChange(userId: string, newRole: string) {
		const targetUser = users.find(u => u.id === userId);
		const res = await fetch(`${base}/admin/users/${userId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role: newRole })
		});

		if (res.ok) {
			users = users.map(u => u.id === userId ? { ...u, role: newRole } : u);
			showToast('success', `Role for ${targetUser?.name || targetUser?.email || 'user'} updated to ${newRole}.`);
		} else {
			const errorData = await res.json().catch(() => null);
			showToast('error', errorData?.message || errorData?.error || 'Failed to update role');
		}
	}

	function requestBan(user: AuthUser) {
		userToBan = user;
		banReason = '';
		banError = '';
		showBanModal = true;
	}

	async function confirmBan() {
		if (!userToBan) return;
		banError = '';
		banLoading = true;
		const targetId = userToBan.id;
		const targetName = userToBan.name || userToBan.email;

		try {
			const res = await fetch(`${base}/admin/users/${targetId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ banned: true, banReason: banReason.trim() || 'Suspended by administrator' })
			});

			if (res.ok) {
				users = users.map(u => u.id === targetId ? { ...u, banned: true, banReason } : u);
				showBanModal = false;
				showToast('success', `User ${targetName} has been suspended.`);
			} else {
				const errorData = await res.json().catch(() => null);
				banError = errorData?.message || errorData?.error || 'Failed to suspend user';
			}
		} catch {
			banError = 'An unexpected error occurred while suspending user.';
		} finally {
			banLoading = false;
		}
	}

	function requestUnban(user: AuthUser) {
		userToUnban = user;
		unbanError = '';
		showUnbanModal = true;
	}

	async function confirmUnban() {
		if (!userToUnban) return;
		unbanError = '';
		unbanLoading = true;
		const targetId = userToUnban.id;
		const targetName = userToUnban.name || userToUnban.email;

		try {
			const res = await fetch(`${base}/admin/users/${targetId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ banned: false, banReason: null })
			});

			if (res.ok) {
				users = users.map(u => u.id === targetId ? { ...u, banned: false, banReason: null } : u);
				showUnbanModal = false;
				showToast('success', `Reactivated account for ${targetName}.`);
			} else {
				const errorData = await res.json().catch(() => null);
				unbanError = errorData?.message || errorData?.error || 'Failed to unban user';
			}
		} catch {
			unbanError = 'An unexpected error occurred while unbanning user.';
		} finally {
			unbanLoading = false;
		}
	}

	function requestDelete(user: AuthUser) {
		userToDelete = user;
		deleteError = '';
		showDeleteModal = true;
	}

	async function confirmDelete() {
		if (!userToDelete) return;
		deleteError = '';
		deleteLoading = true;
		const targetId = userToDelete.id;
		const targetName = userToDelete.name || userToDelete.email;

		try {
			const res = await fetch(`${base}/admin/users/${targetId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' }
			});

			if (res.ok) {
				users = users.filter(u => u.id !== targetId);
				showDeleteModal = false;
				deleteError = '';
				showToast('success', `User ${targetName} was deleted.`);
			} else {
				const errorData = await res.json().catch(() => null);
				deleteError = errorData?.message || errorData?.error || 'Failed to delete user';
			}
		} catch {
			deleteError = 'An unexpected error occurred while deleting user.';
		} finally {
			deleteLoading = false;
		}
	}
</script>

<div class="max-w-6xl mx-auto space-y-lg">
	<!-- Top feedback banner if active -->
	{#if toast}
		<div class="transition-all duration-200">
			<FeedbackBanner
				type={toast.type}
				message={toast.message}
				onDismiss={dismissToast}
				duration={4000}
			/>
		</div>
	{/if}

	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-h1 font-bold mb-xs" style="color: var(--text-primary);">Users</h1>
			<p class="text-body-sm" style="color: var(--text-secondary);">Manage user accounts, roles, and permissions</p>
		</div>
		<button
			type="button"
			onclick={openCreateModal}
			class="btn-primary h-10 px-lg text-body-sm font-medium flex items-center gap-xs"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
			</svg>
			<span>Create User</span>
		</button>
	</div>

	<UserTable
		{users}
		{pagination}
		onrolechange={handleRoleChange}
		onrequestban={requestBan}
		onrequestunban={requestUnban}
		onrequestdelete={requestDelete}
	/>
</div>

<!-- Modal: Create New User -->
{#if showCreateModal}
	<div class="fixed inset-0 z-[100] flex items-center justify-center p-md" style="background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);">
		<div class="card-base w-full max-w-md rounded-xl p-xl shadow-2xl border" style="border-color: var(--border-color); background: var(--bg-surface);">
			<div class="flex items-center justify-between mb-lg">
				<h2 class="text-h2 font-semibold" style="color: var(--text-primary);">Create New User</h2>
				<button
					type="button"
					onclick={closeCreateModal}
					class="text-body-sm hover:opacity-80 p-xs"
					style="color: var(--text-secondary);"
					aria-label="Close modal"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			</div>

			<form onsubmit={handleCreateUser} class="space-y-md">
				{#if createError}
					<div class="mb-md">
						<FeedbackBanner type="error" message={createError} />
					</div>
				{/if}

				<div>
					<label for="new-user-name" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">Name</label>
					<input
						id="new-user-name"
						type="text"
						bind:value={newName}
						placeholder="Jane Doe"
						class="input-base w-full h-10 px-md text-body-sm"
						required
					/>
				</div>

				<div>
					<label for="new-user-email" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">Email</label>
					<input
						id="new-user-email"
						type="email"
						bind:value={newEmail}
						placeholder="jane@example.com"
						class="input-base w-full h-10 px-md text-body-sm"
						required
					/>
				</div>

				<div>
					<label for="new-user-role" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">Role</label>
					<select
						id="new-user-role"
						bind:value={newRole}
						class="input-base w-full h-10 px-md text-body-sm"
					>
						<option value="user">User (Standard)</option>
						<option value="admin">Admin (Full Access)</option>
						<option value="viewer">Viewer (Read-only)</option>
					</select>
				</div>

				<div>
					<label for="new-user-password" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">Initial Password</label>
					<PasswordInput
						id="new-user-password"
						bind:value={newPassword}
						placeholder="••••••••"
						autocomplete="new-password"
						required
					/>
				</div>

				<div class="flex items-center justify-end gap-sm pt-sm">
					<button
						type="button"
						onclick={closeCreateModal}
						class="btn-secondary h-10 px-md text-body-sm font-medium"
						disabled={createLoading}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="btn-primary h-10 px-lg text-body-sm font-medium"
						disabled={createLoading}
					>
						{createLoading ? 'Creating...' : 'Create User'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Modal: Delete User Confirmation -->
{#if showDeleteModal && userToDelete}
	<div class="fixed inset-0 z-[100] flex items-center justify-center p-md" style="background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);">
		<div class="card-base w-full max-w-md rounded-xl p-xl shadow-2xl border" style="border-color: var(--border-color); background: var(--bg-surface);">
			<div class="flex items-center gap-md mb-lg">
				<div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgba(255, 91, 79, 0.15);">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5B4F;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
					</svg>
				</div>
				<div>
					<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Delete User</h3>
					<p class="text-caption" style="color: var(--text-muted);">Permanent action</p>
				</div>
			</div>

			{#if deleteError}
				<div class="mb-md">
					<FeedbackBanner type="error" message={deleteError} />
				</div>
			{/if}

			<p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
				Are you sure you want to delete <strong style="color: var(--text-primary);">{userToDelete.name || userToDelete.email}</strong>?
				All their active sessions, team assignments and project permissions will be permanently removed.
			</p>

			<div class="flex items-center justify-end gap-sm">
				<button
					type="button"
					onclick={() => { showDeleteModal = false; deleteError = ''; }}
					class="btn-secondary h-10 px-md text-body-sm font-medium"
					disabled={deleteLoading}
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmDelete}
					class="btn-danger h-10 px-lg text-body-sm font-medium"
					disabled={deleteLoading}
				>
					{deleteLoading ? 'Deleting...' : 'Delete User'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modal: Ban User -->
{#if showBanModal && userToBan}
	<div class="fixed inset-0 z-[100] flex items-center justify-center p-md" style="background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);">
		<div class="card-base w-full max-w-md rounded-xl p-xl shadow-2xl border" style="border-color: var(--border-color); background: var(--bg-surface);">
			<div class="flex items-center gap-md mb-lg">
				<div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgba(255, 183, 77, 0.15);">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FFB74D;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
					</svg>
				</div>
				<div>
					<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Suspend User</h3>
					<p class="text-caption" style="color: var(--text-muted);">Prevent user access</p>
				</div>
			</div>

			{#if banError}
				<div class="mb-md">
					<FeedbackBanner type="error" message={banError} />
				</div>
			{/if}

			<p class="text-body-sm mb-md" style="color: var(--text-secondary);">
				Suspending <strong style="color: var(--text-primary);">{userToBan.name || userToBan.email}</strong> will revoke access to the platform until reactivated.
			</p>

			<div class="mb-lg">
				<label for="ban-reason-input" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">Reason for suspension (optional)</label>
				<input
					id="ban-reason-input"
					type="text"
					bind:value={banReason}
					placeholder="e.g., Security policy violation"
					class="input-base w-full h-10 px-md text-body-sm"
				/>
			</div>

			<div class="flex items-center justify-end gap-sm">
				<button
					type="button"
					onclick={() => { showBanModal = false; banError = ''; }}
					class="btn-secondary h-10 px-md text-body-sm font-medium"
					disabled={banLoading}
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmBan}
					class="btn-danger h-10 px-lg text-body-sm font-medium"
					disabled={banLoading}
				>
					{banLoading ? 'Suspending...' : 'Suspend User'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modal: Unban User -->
{#if showUnbanModal && userToUnban}
	<div class="fixed inset-0 z-[100] flex items-center justify-center p-md" style="background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);">
		<div class="card-base w-full max-w-md rounded-xl p-xl shadow-2xl border" style="border-color: var(--border-color); background: var(--bg-surface);">
			<div class="flex items-center gap-md mb-lg">
				<div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgba(0, 230, 118, 0.15);">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #00E676;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
				<div>
					<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Reactivate User</h3>
					<p class="text-caption" style="color: var(--text-muted);">Restore platform access</p>
				</div>
			</div>

			{#if unbanError}
				<div class="mb-md">
					<FeedbackBanner type="error" message={unbanError} />
				</div>
			{/if}

			<p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
				Are you sure you want to lift the suspension for <strong style="color: var(--text-primary);">{userToUnban.name || userToUnban.email}</strong>?
			</p>

			<div class="flex items-center justify-end gap-sm">
				<button
					type="button"
					onclick={() => { showUnbanModal = false; unbanError = ''; }}
					class="btn-secondary h-10 px-md text-body-sm font-medium"
					disabled={unbanLoading}
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={confirmUnban}
					class="btn-primary h-10 px-lg text-body-sm font-medium"
					disabled={unbanLoading}
				>
					{unbanLoading ? 'Reactivating...' : 'Reactivate User'}
				</button>
			</div>
		</div>
	</div>
{/if}
