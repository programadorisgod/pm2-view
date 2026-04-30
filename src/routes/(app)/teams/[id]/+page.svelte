<script lang="ts">
	import { Card, Badge, FeedbackBanner } from '$lib/ui/components';
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let { team, members } = $derived(data);

	let activeTab = $state('overview');
	let feedback = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let showInviteModal = $state(false);
	let inviteEmail = $state('');
	let inviteRole = $state('team_member');

	function roleBadge(role: string): { label: string; variant: 'online' | 'stopped' | 'error' | 'offline' } {
		switch (role) {
			case 'team_owner': return { label: 'Owner', variant: 'error' };
			case 'team_admin': return { label: 'Admin', variant: 'online' };
			default: return { label: 'Member', variant: 'offline' };
		}
	}

	async function handleInvite() {
		if (!inviteEmail.trim()) return;
		feedback = null;

		try {
			const res = await fetch(`${base}/teams/${team.id}/members`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: inviteEmail, role: inviteRole })
			});

			const result = await res.json();
			if (res.ok) {
				feedback = { type: 'success', text: 'Member added successfully' };
				showInviteModal = false;
				inviteEmail = '';
				inviteRole = 'team_member';
				await invalidateAll();
			} else {
				feedback = { type: 'error', text: result.error || 'Failed to add member' };
			}
		} catch {
			feedback = { type: 'error', text: 'Failed to add member' };
		}
	}

	async function handleRemoveMember(userId: string, userName: string) {
		feedback = null;
		try {
			const res = await fetch(`${base}/teams/${team.id}/members`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId })
			});

			const result = await res.json();
			if (res.ok) {
				feedback = { type: 'success', text: `${userName} removed from team` };
				await invalidateAll();
			} else {
				feedback = { type: 'error', text: result.error || 'Failed to remove member' };
			}
		} catch {
			feedback = { type: 'error', text: 'Failed to remove member' };
		}
	}

	async function handleRoleChange(userId: string, newRole: string) {
		feedback = null;
		try {
			const res = await fetch(`${base}/teams/${team.id}/members`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, role: newRole })
			});

			const result = await res.json();
			if (res.ok) {
				feedback = { type: 'success', text: 'Role updated successfully' };
				await invalidateAll();
			} else {
				feedback = { type: 'error', text: result.error || 'Failed to update role' };
			}
		} catch {
			feedback = { type: 'error', text: 'Failed to update role' };
		}
	}
</script>

<div class="max-w-5xl mx-auto">
	<!-- Back Button -->
	<div class="mb-lg">
		<a href="{base}/teams" class="btn-secondary px-3 py-1.5 text-caption inline-flex items-center gap-1.5">
			<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
			</svg>
			Back to Teams
		</a>
	</div>

	{#if feedback}
		<FeedbackBanner type={feedback.type} message={feedback.text} />
	{/if}

	<!-- Team Header -->
	<div class="flex items-start justify-between mb-xl">
		<div>
			<h1 class="text-hero font-bold mb-xs" style="view-transition-name: page-title; color: var(--text-primary);">{team.name}</h1>
			{#if team.description}
				<p class="text-body-sm" style="color: var(--text-secondary);">{team.description}</p>
			{/if}
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex gap-xs mb-lg" style="border-bottom: 1px solid var(--border-color);">
		{#each ['overview', 'members'] as tab}
			<button
				class="px-md py-sm text-caption font-medium transition-colors border-b-2"
				style="border-color: {activeTab === tab ? '#38CDFF' : 'transparent'}; color: {activeTab === tab ? '#38CDFF' : 'var(--text-muted)'};"
				onclick={() => (activeTab = tab)}
			>
				{tab.charAt(0).toUpperCase() + tab.slice(1)}
			</button>
		{/each}
	</div>

	<!-- Tab Content -->
	{#key activeTab}
		<div class="tab-content">
			{#if activeTab === 'overview'}
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-md mb-xl">
					<div class="stagger-item" style="--stagger-index: 0;">
						<Card>
							<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">Members</p>
							<p class="text-h1 font-bold" style="color: var(--text-primary);">{members.length}</p>
						</Card>
					</div>
					<div class="stagger-item" style="--stagger-index: 1;">
						<Card>
							<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">Created</p>
							<p class="text-h1 font-bold" style="color: var(--text-primary);">{new Date(team.createdAt).toLocaleDateString()}</p>
						</Card>
					</div>
					<div class="stagger-item" style="--stagger-index: 2;">
						<Card>
							<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">Team ID</p>
							<div class="flex items-center gap-sm">
								<p class="text-body-sm font-mono" style="color: var(--text-primary); word-break: break-all;">{team.id.slice(0, 8)}…</p>
								<button
									class="btn-secondary px-2 py-1 text-caption"
									onclick={async () => {
										await navigator.clipboard.writeText(team.id);
									}}
									title="Copy full ID"
								>
									📋
								</button>
							</div>
							<p class="text-caption mt-1" style="color: var(--text-muted); font-family: monospace;">{team.id}</p>
						</Card>
					</div>
				</div>

				<Card>
					<h2 class="text-h3 font-semibold mb-md" style="color: var(--text-primary);">Team Members</h2>
					{#if members.length === 0}
						<p class="text-center py-xl" style="color: var(--text-muted);">No members yet</p>
					{:else}
						<div class="space-y-xs">
							{#each members as member, i (member.userId)}
								<div class="flex items-center justify-between py-sm px-md rounded-md" style="border-bottom: 1px solid var(--border-color);">
									<div class="flex items-center gap-md">
										<div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: var(--bg-surface);">
											<span class="text-body-sm font-medium" style="color: var(--text-primary);">{member.user.name?.charAt(0) ?? member.user.email.charAt(0)}</span>
										</div>
										<div>
											<p class="text-body-sm font-medium" style="color: var(--text-primary);">{member.user.name ?? member.user.email}</p>
											{#if member.user.name}<p class="text-caption" style="color: var(--text-muted);">{member.user.email}</p>{/if}
										</div>
									</div>
									<Badge variant={roleBadge(member.role).variant}>{roleBadge(member.role).label}</Badge>
								</div>
							{/each}
						</div>
					{/if}
				</Card>
			{:else if activeTab === 'members'}
				<Card>
					<div class="flex items-center justify-between mb-lg">
						<h2 class="text-h3 font-semibold" style="color: var(--text-primary);">Manage Members</h2>
						<button class="btn-primary px-4 py-2 text-body-sm" onclick={() => (showInviteModal = true)}>
							Invite Member
						</button>
					</div>

					{#if members.length === 0}
						<p class="text-center py-xl" style="color: var(--text-muted);">No members yet. Invite someone to get started.</p>
					{:else}
						<div class="space-y-sm">
							{#each members as member (member.userId)}
								<div class="flex items-center justify-between py-sm px-md rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
									<div class="flex items-center gap-md">
										<div class="w-8 h-8 rounded-full flex items-center justify-center" style="background: var(--bg-card);">
											<span class="text-body-sm font-medium" style="color: var(--text-primary);">{member.user.name?.charAt(0) ?? member.user.email.charAt(0)}</span>
										</div>
										<div>
											<p class="text-body-sm font-medium" style="color: var(--text-primary);">{member.user.name ?? member.user.email}</p>
											{#if member.user.name}<p class="text-caption" style="color: var(--text-muted);">{member.user.email}</p>{/if}
										</div>
									</div>
									<div class="flex items-center gap-sm">
										<Badge variant={roleBadge(member.role).variant}>{roleBadge(member.role).label}</Badge>
										{#if member.role !== 'team_owner'}
											<select
												class="text-caption px-2 py-1 rounded"
												style="background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary);"
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
				</Card>
			{/if}
		</div>
	{/key}
</div>

<!-- Invite Modal -->
{#if showInviteModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.5);">
		<div class="w-full max-w-md p-xl rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h2 class="text-h3 font-semibold mb-lg" style="color: var(--text-primary);">Invite Member</h2>

			<div class="space-y-md">
				<div>
					<label for="invite-email" class="block text-caption mb-1" style="color: var(--text-secondary);">Email</label>
					<input
						id="invite-email"
						type="email"
						bind:value={inviteEmail}
						class="w-full px-4 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
						placeholder="user@example.com"
					/>
				</div>

				<div>
					<label for="invite-role" class="block text-caption mb-1" style="color: var(--text-secondary);">Role</label>
					<select
						id="invite-role"
						bind:value={inviteRole}
						class="w-full px-4 py-2 rounded-md border text-body-sm"
						style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
					>
						<option value="team_member">Member</option>
						<option value="team_admin">Admin</option>
					</select>
				</div>
			</div>

			<div class="flex gap-md mt-xl justify-end">
				<button class="btn-secondary px-4 py-2 text-body-sm" onclick={() => { showInviteModal = false; inviteEmail = ''; }}>
					Cancel
				</button>
				<button class="btn-primary px-4 py-2 text-body-sm" onclick={handleInvite} disabled={!inviteEmail.trim()}>
					Invite
				</button>
			</div>
		</div>
	</div>
{/if}
