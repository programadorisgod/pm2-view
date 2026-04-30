<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let project = $derived(data.project);
	let members = $derived(data.members || []);
	let availableUsers = $derived(data.availableUsers || []);

	let showInviteModal = $state(false);
	let selectedUserId = $state('');
	let selectedRole = $state('viewer');

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
				// Refresh the page to show updated members
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
