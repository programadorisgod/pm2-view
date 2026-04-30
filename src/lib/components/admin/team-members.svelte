<script lang="ts">
	import { base } from '$app/paths';
	import Button from '$lib/ui/components/button.svelte';
	import Badge from '$lib/ui/components/badge.svelte';
	import type { AuthUser } from '$lib/auth/provider.interface';

	let {
		members = [],
		teamId,
		onrolechange,
		onremove
	}: {
		members: (AuthUser & { teamRole?: string })[];
		teamId: string;
		onrolechange?: (teamId: string, userId: string, newRole: string) => void;
		onremove?: (teamId: string, userId: string) => void;
	} = $props();

	function getRoleVariant(role: string) {
		switch (role) {
			case 'team_owner': return 'error';
			case 'team_admin': return 'online';
			case 'team_member': return 'offline';
			default: return 'stopped';
		}
	}

	function handleRoleChange(userId: string, event: Event) {
		const select = event.target as HTMLSelectElement;
		onrolechange?.(teamId, userId, select.value);
	}

	function handleRemove(userId: string) {
		if (confirm('Are you sure you want to remove this member?')) {
			onremove?.(teamId, userId);
		}
	}
</script>

<div class="mt-md">
	<h4 class="text-body-sm font-semibold mb-sm" style="color: var(--text-secondary);">Members</h4>
	<div class="space-y-xs">
		{#each members as member (member.id)}
			<div class="flex items-center justify-between py-2 px-3 rounded" style="background: var(--bg-card);">
				<div class="flex-1">
					<span class="text-body-sm" style="color: var(--text-primary);">{member.name || member.email}</span>
					<span class="text-caption ml-2" style="color: var(--text-muted);">{member.email}</span>
				</div>
				<div class="flex items-center gap-2">
					<select
						value={member.teamRole || 'team_member'}
						onchange={(e) => handleRoleChange(member.id, e)}
						class="px-2 py-1 rounded text-caption border"
						style="background: var(--bg-surface); border-color: var(--border-color); color: var(--text-primary);"
					>
						<option value="team_owner">Owner</option>
						<option value="team_admin">Admin</option>
						<option value="team_member">Member</option>
					</select>
					<Button variant="danger" size="xs" onclick={() => handleRemove(member.id)}>
						Remove
					</Button>
				</div>
			</div>
		{/each}

		{#if members.length === 0}
			<p class="text-caption text-center py-2" style="color: var(--text-muted);">No members yet</p>
		{/if}
	</div>
</div>
