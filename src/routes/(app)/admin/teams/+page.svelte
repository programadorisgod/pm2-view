<script lang="ts">
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let teams = $derived(data.teams || []);
	let pagination = $derived(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
	let availableUsers = $derived(data.availableUsers || []);

	// Create modal
	let showCreateModal = $state(false);
	let newTeamName = $state('');
	let newTeamDesc = $state('');

	// Edit modal
	let showEditModal = $state(false);
	let editTeamId = $state('');
	let editTeamName = $state('');
	let editTeamDesc = $state('');

	// Delete confirmation
	let showDeleteConfirm = $state(false);
	let deleteTeamId = $state('');
	let deleteTeamName = $state('');

	// Member management
	let showMemberModal = $state(false);
	let memberTeamId = $state('');
	let memberTeamName = $state('');
	let selectedUserId = $state('');
	let memberRole = $state('team_member');
	let teamMembers = $state<any[]>([]);

	async function handleCreateTeam() {
		if (!newTeamName.trim()) return;

		try {
			const res = await fetch(`${base}/admin/teams`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newTeamName, description: newTeamDesc })
			});

			if (res.ok) {
				showCreateModal = false;
				newTeamName = '';
				newTeamDesc = '';
				await invalidateAll();
			} else {
				const result = await res.json();
				alert(result.error || 'Failed to create team');
			}
		} catch (err) {
			console.error('Failed to create team:', err);
		}
	}

	function openEdit(team: any) {
		editTeamId = team.id;
		editTeamName = team.name;
		editTeamDesc = team.description || '';
		showEditModal = true;
	}

	async function handleEditTeam() {
		if (!editTeamName.trim()) return;

		try {
			const res = await fetch(`${base}/admin/teams/${editTeamId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: editTeamName, description: editTeamDesc })
			});

			if (res.ok) {
				showEditModal = false;
				await invalidateAll();
			} else {
				const result = await res.json();
				alert(result.error || 'Failed to update team');
			}
		} catch (err) {
			console.error('Failed to update team:', err);
		}
	}

	function openDelete(team: any) {
		deleteTeamId = team.id;
		deleteTeamName = team.name;
		showDeleteConfirm = true;
	}

	async function handleDeleteTeam() {
		try {
			const res = await fetch(`${base}/admin/teams/${deleteTeamId}`, {
				method: 'DELETE'
			});

			if (res.ok) {
				showDeleteConfirm = false;
				await invalidateAll();
			} else {
				const result = await res.json();
				alert(result.error || 'Failed to delete team');
			}
		} catch (err) {
			console.error('Failed to delete team:', err);
		}
	}

	async function openMembers(team: any) {
		memberTeamId = team.id;
		memberTeamName = team.name;
		selectedUserId = '';
		memberRole = 'team_member';

		// Load existing members
		try {
			const res = await fetch(`${base}/admin/teams/${team.id}/members`);
			if (res.ok) {
				const result = await res.json();
				teamMembers = result.members || [];
			}
		} catch (err) {
			console.error('Failed to load members:', err);
		}

		showMemberModal = true;
	}

	async function handleAddMember() {
		if (!selectedUserId) return;

		try {
			const res = await fetch(`${base}/admin/teams/${memberTeamId}/members`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: selectedUserId, role: memberRole })
			});

			const result = await res.json();
			if (res.ok) {
				selectedUserId = '';
				memberRole = 'team_member';
				// Reload members
				const membersRes = await fetch(`${base}/admin/teams/${memberTeamId}/members`);
				if (membersRes.ok) {
					const membersResult = await membersRes.json();
					teamMembers = membersResult.members || [];
				}
			} else {
				alert(result.error || 'Failed to add member');
			}
		} catch (err) {
			console.error('Failed to add member:', err);
		}
	}

	async function handleRemoveMember(userId: string, userName: string) {
		if (!confirm(`Remove ${userName} from this team?`)) return;

		try {
			const res = await fetch(`${base}/admin/teams/${memberTeamId}/members?userId=${userId}`, {
				method: 'DELETE'
			});

			const result = await res.json();
			if (res.ok) {
				// Reload members
				const membersRes = await fetch(`${base}/admin/teams/${memberTeamId}/members`);
				if (membersRes.ok) {
					const membersResult = await membersRes.json();
					teamMembers = membersResult.members || [];
				}
			} else {
				alert(result.error || 'Failed to remove member');
			}
		} catch (err) {
			console.error('Failed to remove member:', err);
		}
	}

	async function handleRoleChange(userId: string, newRole: string) {
		try {
			const res = await fetch(`${base}/admin/teams/${memberTeamId}/members`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, role: newRole })
			});

			const result = await res.json();
			if (res.ok) {
				// Reload members
				const membersRes = await fetch(`${base}/admin/teams/${memberTeamId}/members`);
				if (membersRes.ok) {
					const membersResult = await membersRes.json();
					teamMembers = membersResult.members || [];
				}
			} else {
				alert(result.error || 'Failed to update role');
			}
		} catch (err) {
			console.error('Failed to update role:', err);
		}
	}

	function roleLabel(role: string): string {
		switch (role) {
			case 'team_owner': return 'Owner';
			case 'team_admin': return 'Admin';
			default: return 'Member';
		}
	}

	function roleColor(role: string): string {
		switch (role) {
			case 'team_owner': return '#FF5252';
			case 'team_admin': return '#00E676';
			default: return 'var(--text-muted)';
		}
	}

	let memberIds = $derived(new Set(teamMembers.map(m => m.userId)));
	let nonMembers = $derived(availableUsers.filter(u => !memberIds.has(u.id)));
</script>

<div class="max-w-6xl mx-auto">
	<!-- Header -->
	<div class="mb-xl flex justify-between items-start">
		<div>
			<h1 class="text-h1 font-bold mb-xs" style="color: var(--text-primary);">Teams</h1>
			<p class="text-body-sm" style="color: var(--text-secondary);">Manage teams and team members</p>
		</div>
		<button
			class="btn-primary px-4 py-2 text-body-sm"
			onclick={() => (showCreateModal = true)}
		>
			Create Team
		</button>
	</div>

	<!-- Teams List -->
	<div class="space-y-md">
		{#each teams as team (team.id)}
			<div class="p-lg rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
				<div class="flex justify-between items-start mb-md">
					<div>
						<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">{team.name}</h3>
						<p class="text-caption" style="color: var(--text-muted);">{team.description || 'No description'}</p>
					</div>
					<div class="flex items-center gap-sm">
						<span class="text-caption" style="color: var(--text-muted);">
							{team.memberCount || 0} members
						</span>
						<button class="btn-secondary px-2 py-1 text-caption" onclick={() => openMembers(team)}>
							Members
						</button>
						<button class="btn-secondary px-2 py-1 text-caption" onclick={() => openEdit(team)}>
							Edit
						</button>
						<button class="btn-danger px-2 py-1 text-caption" onclick={() => openDelete(team)}>
							Delete
						</button>
					</div>
				</div>
			</div>
		{/each}

		{#if teams.length === 0}
			<div class="text-center py-2xl" style="color: var(--text-muted);">
				No teams found. Create one to get started.
			</div>
		{/if}
	</div>

	<!-- Pagination -->
	{#if pagination.totalPages > 1}
		<div class="flex justify-center gap-2 mt-xl">
			{#each Array(pagination.totalPages) as _, i}
				<a
					href="{base}/admin/teams?page={i + 1}"
					class="px-3 py-1 rounded text-caption"
					style="background: {pagination.page === i + 1 ? 'var(--bg-card)' : 'transparent'}; color: var(--text-primary);"
				>
					{i + 1}
				</a>
			{/each}
		</div>
	{/if}
</div>

<!-- Create Team Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.5);">
		<div class="w-full max-w-md p-xl rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h2 class="text-h3 font-semibold mb-lg" style="color: var(--text-primary);">Create Team</h2>

			<div class="space-y-md">
				<div>
					<label for="team-name" class="block text-caption mb-1" style="color: var(--text-secondary);">Name</label>
					<input
						id="team-name"
						type="text"
						bind:value={newTeamName}
						class="w-full px-4 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
						placeholder="Team name"
					/>
				</div>

				<div>
					<label for="team-desc" class="block text-caption mb-1" style="color: var(--text-secondary);">Description</label>
					<textarea
						id="team-desc"
						bind:value={newTeamDesc}
						class="w-full px-4 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
						rows="3"
						placeholder="Team description (optional)"
					></textarea>
				</div>
			</div>

			<div class="flex gap-md mt-xl justify-end">
				<button
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={() => (showCreateModal = false)}
				>
					Cancel
				</button>
				<button
					class="btn-primary px-4 py-2 text-body-sm"
					onclick={handleCreateTeam}
					disabled={!newTeamName.trim()}
				>
					Create
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Team Modal -->
{#if showEditModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.5);">
		<div class="w-full max-w-md p-xl rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h2 class="text-h3 font-semibold mb-lg" style="color: var(--text-primary);">Edit Team</h2>

			<div class="space-y-md">
				<div>
					<label for="edit-team-name" class="block text-caption mb-1" style="color: var(--text-secondary);">Name</label>
					<input
						id="edit-team-name"
						type="text"
						bind:value={editTeamName}
						class="w-full px-4 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
					/>
				</div>

				<div>
					<label for="edit-team-desc" class="block text-caption mb-1" style="color: var(--text-secondary);">Description</label>
					<textarea
						id="edit-team-desc"
						bind:value={editTeamDesc}
						class="w-full px-4 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
						rows="3"
					></textarea>
				</div>
			</div>

			<div class="flex gap-md mt-xl justify-end">
				<button
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={() => (showEditModal = false)}
				>
					Cancel
				</button>
				<button
					class="btn-primary px-4 py-2 text-body-sm"
					onclick={handleEditTeam}
					disabled={!editTeamName.trim()}
				>
					Save
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
	<div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.5);">
		<div class="w-full max-w-md p-xl rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h2 class="text-h3 font-semibold mb-lg" style="color: #FF5252;">Delete Team</h2>
			<p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
				Are you sure you want to delete <strong>{deleteTeamName}</strong>? This will also remove all team members. This action cannot be undone.
			</p>

			<div class="flex gap-md justify-end">
				<button
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={() => (showDeleteConfirm = false)}
				>
					Cancel
				</button>
				<button
					class="btn-danger px-4 py-2 text-body-sm"
					onclick={handleDeleteTeam}
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Members Modal -->
{#if showMemberModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.5);">
		<div class="w-full max-w-lg p-xl rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color); max-height: 80vh; overflow-y: auto;">
			<h2 class="text-h3 font-semibold mb-lg" style="color: var(--text-primary);">
				Members: {memberTeamName}
			</h2>

			<!-- Add member form -->
			<div class="mb-lg p-md rounded-lg" style="background: var(--bg-card); border: 1px solid var(--border-color);">
				<h3 class="text-caption font-medium mb-sm" style="color: var(--text-secondary);">Add Member</h3>
				<div class="flex gap-sm flex-wrap">
					<select
						bind:value={selectedUserId}
						class="flex-1 min-w-[180px] px-3 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-surface); border-color: var(--border-color); color: var(--text-primary);"
					>
						<option value="">Select a user...</option>
						{#each nonMembers as user}
							<option value={user.id}>{user.name || user.email}</option>
						{/each}
					</select>
					<select
						bind:value={memberRole}
						class="px-3 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-surface); border-color: var(--border-color); color: var(--text-primary);"
					>
						<option value="team_member">Member</option>
						<option value="team_admin">Admin</option>
						<option value="team_owner">Owner</option>
					</select>
					<button
						class="btn-primary px-4 py-2 text-body-sm"
						onclick={handleAddMember}
						disabled={!selectedUserId}
					>
						Add
					</button>
				</div>
			</div>

			<!-- Members list -->
			{#if teamMembers.length === 0}
				<p class="text-center py-xl" style="color: var(--text-muted);">No members yet</p>
			{:else}
				<div class="space-y-sm">
					{#each teamMembers as member (member.userId)}
						<div class="flex items-center justify-between py-sm px-md rounded-lg" style="background: var(--bg-card); border: 1px solid var(--border-color);">
							<div>
								<p class="text-body-sm font-medium" style="color: var(--text-primary);">{member.user.name ?? member.user.email}</p>
								{#if member.user.name}<p class="text-caption" style="color: var(--text-muted);">{member.user.email}</p>{/if}
							</div>
							<div class="flex items-center gap-sm">
								<span class="text-caption font-medium" style="color: {roleColor(member.role)};">{roleLabel(member.role)}</span>
								{#if member.role !== 'team_owner'}
									<select
										class="text-caption px-2 py-1 rounded"
										style="background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-primary);"
										value={member.role}
										onchange={(e) => handleRoleChange(member.userId, (e.target as HTMLSelectElement).value)}
									>
										<option value="team_member">Member</option>
										<option value="team_admin">Admin</option>
									</select>
									<button
										class="btn-danger px-2 py-1 text-caption"
										onclick={() => handleRemoveMember(member.userId, member.user.name ?? member.user.email)}
									>
										Remove
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<div class="flex gap-md mt-xl justify-end">
				<button
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={() => (showMemberModal = false)}
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}
