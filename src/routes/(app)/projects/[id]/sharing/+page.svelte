<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let project = $derived(data.project);
	let members = $derived(data.members || []);
	let availableUsers = $derived(data.availableUsers || []);
	let team = $derived(data.team);
	let userRole = $derived(data.userRole);
	let isAdmin = $derived(userRole === 'admin');

	let showInviteModal = $state(false);
	let selectedUserId = $state('');
	let selectedRole = $state('viewer');

	// Team assignment state
	let showTeamModal = $state(false);
	let selectedTeamId = $state<string | null>(null);
	let availableTeams = $state<Array<{ id: string; name: string }>>([]);
	let teamAssigning = $state(false);
	let teamMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	async function loadTeams() {
		try {
			const res = await fetch(`${base}/admin/projects/teams`);
			if (res.ok) {
				const result = await res.json();
				availableTeams = result.teams || [];
			}
		} catch (err) {
			console.error('Failed to load teams:', err);
		}
	}

	async function handleAssignTeam() {
		if (!project?.id) return;
		teamAssigning = true;
		teamMessage = null;

		try {
			const res = await fetch(`${base}/admin/projects/${project.id}/team`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ teamId: selectedTeamId })
			});

			if (res.ok) {
				teamMessage = { type: 'success', text: selectedTeamId ? 'Project assigned to team' : 'Project unassigned from team' };
				showTeamModal = false;
				goto(`${base}/projects/${project.id}/sharing`, { invalidateAll: true });
			} else {
				const error = await res.json();
				teamMessage = { type: 'error', text: error.message || 'Failed to assign team' };
			}
		} catch (err) {
			teamMessage = { type: 'error', text: 'Failed to assign team' };
		} finally {
			teamAssigning = false;
		}
	}

	async function handleInvite() {
		if (!selectedUserId) return;

		try {
			const res = await fetch(`${base}/projects/${project?.id}/members`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: selectedUserId, role: selectedRole })
			});

			if (res.ok) {
				showInviteModal = false;
				selectedUserId = '';
				selectedRole = 'viewer';
				goto(`${base}/projects/${project?.id}/sharing`, { invalidateAll: true });
			}
		} catch (err) {
			console.error('Failed to invite user:', err);
		}
	}

	async function handleRoleChange(memberId: string, newRole: string) {
		try {
			const res = await fetch(`${base}/projects/${project?.id}/members`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: memberId, role: newRole })
			});

			if (res.ok) {
				goto(`${base}/projects/${project?.id}/sharing`, { invalidateAll: true });
			}
		} catch (err) {
			console.error('Failed to update role:', err);
		}
	}

	async function handleRemoveMember(memberId: string) {
		if (!confirm('Are you sure you want to remove this member?')) return;

		try {
			const res = await fetch(`${base}/projects/${project?.id}/members?userId=${memberId}`, {
				method: 'DELETE'
			});

			if (res.ok) {
				goto(`${base}/projects/${project?.id}/sharing`, { invalidateAll: true });
			}
		} catch (err) {
			console.error('Failed to remove member:', err);
		}
	}
</script>

<div class="max-w-4xl mx-auto">
	<!-- Header -->
	<div class="mb-xl">
		<h1 class="text-h1 font-bold mb-xs" style="color: var(--text-primary);">
			Sharing: {project?.name || 'Project'}
		</h1>
		<p class="text-body-sm" style="color: var(--text-secondary);">Manage who has access to this project</p>
	</div>

	{#if teamMessage}
		<div class="mb-md p-md rounded-md" style="background: {teamMessage.type === 'success' ? 'rgba(0,230,118,0.1)' : 'rgba(255,82,82,0.1)'}; border: 1px solid {teamMessage.type === 'success' ? '#00E676' : '#FF5252'};">
			<p class="text-body-sm" style="color: {teamMessage.type === 'success' ? '#00E676' : '#FF5252'};">{teamMessage.text}</p>
		</div>
	{/if}

	<!-- Team Assignment Card (Admin only) -->
	{#if isAdmin}
		<div class="mb-xl" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 0.5rem;">
			<div class="p-lg border-b" style="border-color: var(--border-color);">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-h3 font-semibold" style="color: var(--text-primary);">Team Assignment</h2>
						<p class="text-caption" style="color: var(--text-muted);">Assign this project to a team so all team members can access it</p>
					</div>
					<button
						class="btn-secondary px-3 py-1.5 text-caption"
						onclick={() => { selectedTeamId = team?.id ?? null; loadTeams(); showTeamModal = true; }}
					>
						{team ? 'Change Team' : 'Assign Team'}
					</button>
				</div>
			</div>

			<div class="p-lg">
				{#if team}
					<div class="flex items-center gap-3">
						<span class="inline-block w-2 h-2 rounded-full" style="background: #38CDFF;"></span>
						<span class="text-body-sm font-medium" style="color: var(--text-primary);">Assigned to: {team.name}</span>
						<span class="text-caption" style="color: var(--text-muted);">(All team members have access)</span>
					</div>
				{:else}
					<div class="flex items-center gap-3">
						<span class="inline-block w-2 h-2 rounded-full" style="background: var(--text-muted);"></span>
						<span class="text-body-sm" style="color: var(--text-muted);">Not assigned to any team (personal project)</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Members List -->
	<div class="mb-xl" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 0.5rem;">
		<div class="p-lg border-b" style="border-color: var(--border-color);">
			<h2 class="text-h3 font-semibold" style="color: var(--text-primary);">Members</h2>
		</div>

		<div class="divide-y" style="divide-color: var(--border-color);">
			{#each members as member (member.userId)}
				<div class="p-lg flex items-center justify-between">
					<div>
						<p class="text-body-sm font-medium" style="color: var(--text-primary);">
							{member.name || member.email}
						</p>
						<p class="text-caption" style="color: var(--text-muted);">{member.email}</p>
					</div>
					<div class="flex items-center gap-3">
						{#if member.role !== 'owner'}
							<select
								value={member.role}
								onchange={(e) => handleRoleChange(member.userId, (e.target as HTMLSelectElement).value)}
								class="px-3 py-1.5 rounded-md text-caption border"
								style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
							>
								<option value="editor">Editor</option>
								<option value="viewer">Viewer</option>
							</select>
							<button
								class="text-caption text-[#FF5252] hover:underline"
								onclick={() => handleRemoveMember(member.userId)}
							>
								Remove
							</button>
						{:else}
							<span class="text-caption px-3 py-1.5" style="color: var(--text-muted);">Owner</span>
						{/if}
					</div>
				</div>
			{/each}

			{#if members.length === 0}
				<div class="p-lg text-center" style="color: var(--text-muted);">
					No members yet
				</div>
			{/if}
		</div>
	</div>

	<!-- Invite Button -->
	<button
		class="btn-primary px-4 py-2 text-body-sm"
		onclick={() => (showInviteModal = true)}
	>
		Invite User
	</button>
</div>

<!-- Team Assignment Modal (Admin only) -->
{#if showTeamModal && isAdmin}
	<div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.5);">
		<div class="w-full max-w-md p-xl rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h2 class="text-h3 font-semibold mb-lg" style="color: var(--text-primary);">Assign to Team</h2>

			<div class="space-y-md">
				<div>
					<label for="assign-team" class="block text-caption mb-1" style="color: var(--text-secondary);">Team</label>
					<select
						id="assign-team"
						bind:value={selectedTeamId}
						class="w-full px-4 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
					>
						<option value="">None (personal project)</option>
						{#each availableTeams as t}
							<option value={t.id}>{t.name}</option>
						{/each}
					</select>
				</div>

				{#if selectedTeamId}
					<p class="text-caption" style="color: var(--text-muted);">
						All members of this team will have access to the project.
						Roles are mapped: team_owner → owner, team_admin → editor, team_member → viewer
					</p>
				{/if}
			</div>

			<div class="flex gap-md mt-xl justify-end">
				<button
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={() => (showTeamModal = false)}
					disabled={teamAssigning}
				>
					Cancel
				</button>
				<button
					class="btn-primary px-4 py-2 text-body-sm"
					onclick={handleAssignTeam}
					disabled={teamAssigning}
				>
					{teamAssigning ? 'Assigning...' : (selectedTeamId ? 'Assign' : 'Unassign')}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Invite Modal -->
{#if showInviteModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.5);">
		<div class="w-full max-w-md p-xl rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h2 class="text-h3 font-semibold mb-lg" style="color: var(--text-primary);">Invite User</h2>

			<div class="space-y-md">
				<div>
					<label for="share-user" class="block text-caption mb-1" style="color: var(--text-secondary);">User</label>
					<select
						id="share-user"
						bind:value={selectedUserId}
						class="w-full px-4 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
					>
						<option value="">Select a user...</option>
						{#each availableUsers as user}
							<option value={user.id}>{user.name || user.email}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="share-role" class="block text-caption mb-1" style="color: var(--text-secondary);">Role</label>
					<select
						id="share-role"
						bind:value={selectedRole}
						class="w-full px-4 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
					>
						<option value="viewer">Viewer</option>
						<option value="editor">Editor</option>
					</select>
				</div>
			</div>

			<div class="flex gap-md mt-xl justify-end">
				<button
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={() => (showInviteModal = false)}
				>
					Cancel
				</button>
				<button
					class="btn-primary px-4 py-2 text-body-sm"
					onclick={handleInvite}
					disabled={!selectedUserId}
				>
					Invite
				</button>
			</div>
		</div>
	</div>
{/if}
