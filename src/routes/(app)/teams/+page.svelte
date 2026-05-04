	<script lang="ts">
	import { Card, Badge, FeedbackBanner } from '$lib/ui/components';
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let teams = $derived(data.teams ?? []);

	let feedback = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let showJoinModal = $state(false);
	let joinTeamId = $state('');
	let joinTeamLoading = $state(false);
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

	function showFeedback(type: 'success' | 'error', text: string) {
		if (feedbackTimer) clearTimeout(feedbackTimer);
		feedback = { type, text };
		feedbackTimer = setTimeout(() => { feedback = null; }, 3000);
	}

	function roleBadge(role: string): { label: string; variant: 'online' | 'stopped' | 'error' | 'offline' } {
		switch (role) {
			case 'team_owner': return { label: 'Owner', variant: 'error' };
			case 'team_admin': return { label: 'Admin', variant: 'online' };
			default: return { label: 'Member', variant: 'offline' };
		}
	}

	function handleJoinResult() {
		return async ({ result }: { result: any }) => {
			if (result.type === 'success') {
				showFeedback('success', result.data?.message || 'Joined team successfully');
				showJoinModal = false;
				joinTeamId = '';
				await invalidateAll();
			} else {
				showFeedback('error', result.data?.error || 'Failed to join team');
			}
		};
	}
</script>

<div class="max-w-6xl mx-auto">
	<!-- Header -->
	<div class="mb-xl flex justify-between items-start">
		<div>
			<h1 class="text-hero font-bold mb-xs" style="view-transition-name: page-title; color: var(--text-primary);">My Teams</h1>
			<p class="text-body-sm" style="color: var(--text-secondary);">View and manage your team memberships</p>
		</div>
		<button class="btn-primary px-4 py-2 text-body-sm" onclick={() => (showJoinModal = true)}>
			Join Team
		</button>
	</div>

	{#if feedback}
		<div class="mb-lg">
			<FeedbackBanner type={feedback.type} message={feedback.text} onDismiss={() => { feedback = null; if (feedbackTimer) clearTimeout(feedbackTimer); }} />
		</div>
	{/if}

	{#if teams.length === 0}
		<Card>
			<div class="text-center py-2xl">
				<p class="text-h3 font-semibold mb-xs" style="color: var(--text-secondary);">No Teams Found</p>
				<p class="text-body-sm mb-md" style="color: var(--text-muted);">You haven't been added to any teams yet</p>
				<button class="btn-primary px-4 py-2 text-body-sm" onclick={() => (showJoinModal = true)}>
					Join a Team
				</button>
			</div>
		</Card>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
			{#each teams as team, i (team.id)}
				<div class="stagger-item" style="--stagger-index: {i};">
					<Card class="group">
						<div class="flex items-start justify-between mb-md">
							<div>
								<h3 class="text-body-sm font-semibold mb-xs" style="color: var(--text-primary);">{team.name}</h3>
								<Badge variant={roleBadge(team.userRole).variant}>{roleBadge(team.userRole).label}</Badge>
							</div>
						</div>

						{#if team.description}
							<p class="text-caption mb-md" style="color: var(--text-muted);">{team.description}</p>
						{/if}

						<div class="flex justify-between text-caption mb-lg">
							<span style="color: var(--text-muted);">Members</span>
							<span class="font-medium" style="color: var(--text-primary);">{team.memberCount}</span>
						</div>

						<a href="{base}/teams/{team.id}" class="btn-secondary px-3 py-1 text-caption flex-1 text-center block">
							View Details →
						</a>
					</Card>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Join Team Modal -->
{#if showJoinModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.5);">
		<form method="POST" action="?/joinTeam" use:enhance={handleJoinResult} class="w-full max-w-md p-xl rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h2 class="text-h3 font-semibold mb-lg" style="color: var(--text-primary);">Join Team</h2>
			<p class="text-body-sm mb-md" style="color: var(--text-secondary);">
				Enter the Team ID to join. You can get this from a team admin.
			</p>

			<div class="space-y-md">
				<div>
					<label for="join-team-id" class="block text-caption mb-1" style="color: var(--text-secondary);">Team ID</label>
					<input
						id="join-team-id"
						name="teamId"
						type="text"
						bind:value={joinTeamId}
						class="w-full px-4 py-2 rounded-md border text-body-sm font-mono"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
						placeholder="e.g. a1b2c3d4-e5f6-..."
					/>
				</div>
			</div>

			<div class="flex gap-md mt-xl justify-end">
				<button
					type="button"
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={() => { showJoinModal = false; joinTeamId = ''; }}
				>
					Cancel
				</button>
				<button
					type="submit"
					class="btn-primary px-4 py-2 text-body-sm"
					disabled={!joinTeamId.trim()}
				>
					Join
				</button>
			</div>
		</form>
	</div>
{/if}
