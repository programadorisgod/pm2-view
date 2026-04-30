<script lang="ts">
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import TeamMembers from '$lib/components/admin/team-members.svelte';

	let { data }: { data: PageData } = $props();

	let teams = $derived(data.teams || []);
	let pagination = $derived(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });

	let showCreateModal = $state(false);
	let newTeamName = $state('');
	let newTeamDesc = $state('');

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
				window.location.reload();
			}
		} catch (err) {
			console.error('Failed to create team:', err);
		}
	}
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
					<span class="text-caption" style="color: var(--text-muted);">
						{team.memberCount || 0} members
					</span>
				</div>

				<!-- Team Members -->
				{#if team.members && team.members.length > 0}
					<TeamMembers
						members={team.members.map(tm => ({
							id: tm.user.id,
							name: tm.user.name,
							email: tm.user.email,
							role: tm.user.role,
							teamRole: tm.role
						}))}
						teamId={team.id}
					/>
				{/if}
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
