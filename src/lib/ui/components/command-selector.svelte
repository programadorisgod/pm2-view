<script lang="ts">
	import type { DeployCommand } from '$lib/deploy-config/deploy-config.types';

	let {
		commands,
		onSelect,
		onCancel,
	}: {
		commands: DeployCommand[];
		onSelect: (selectedIds: string[]) => void;
		onCancel: () => void;
	} = $props();

	// All checked by default
	let selectedIds = $state<string[]>(commands.map((c) => c.id));

	const allSelected = $derived(selectedIds.length === commands.length);
	const noneSelected = $derived(selectedIds.length === 0);

	function toggleCommand(id: string) {
		if (selectedIds.includes(id)) {
			selectedIds = selectedIds.filter((i) => i !== id);
		} else {
			selectedIds = [...selectedIds, id];
		}
	}

	function toggleAll() {
		if (allSelected) {
			selectedIds = [];
		} else {
			selectedIds = commands.map((c) => c.id);
		}
	}

	function handleDeploy() {
		onSelect(selectedIds);
	}

	function truncateCommand(cmd: string, maxLen = 80): string {
		if (cmd.length <= maxLen) return cmd;
		return cmd.slice(0, maxLen) + '...';
	}
</script>

<div class="space-y-lg">
	<div class="mb-md">
		<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
			Select restart commands
		</h3>
		<p class="text-caption" style="color: var(--text-muted);">
			Choose which processes to restart during this deploy
		</p>
	</div>

	{#if commands.length === 0}
		<p class="text-body-sm" style="color: var(--text-muted);">
			No restart commands configured.
		</p>
	{:else}
		<div class="space-y-xs">
			<!-- Select all checkbox -->
			<div
				class="flex items-center gap-sm p-sm rounded-md"
				style="background: var(--bg-surface); border: 1px solid var(--border-color);"
			>
				<input
					type="checkbox"
					id="select-all"
					checked={allSelected}
					onchange={toggleAll}
					class="w-4 h-4 rounded"
					style="accent-color: #38CDFF;"
				/>
				<label for="select-all" class="text-body-sm font-medium" style="color: var(--text-primary);">
					Select all ({selectedIds.length} of {commands.length} selected)
				</label>
			</div>

			<!-- Individual command checkboxes -->
			{#each commands as cmd (cmd.id)}
				<div
					class="flex items-center gap-sm p-sm rounded-md"
					style="background: var(--bg-surface); border: 1px solid var(--border-color);"
				>
					<input
						type="checkbox"
						id="cmd-{cmd.id}"
						checked={selectedIds.includes(cmd.id)}
						onchange={() => toggleCommand(cmd.id)}
						class="w-4 h-4 rounded"
						style="accent-color: #38CDFF;"
					/>
					<label for="cmd-{cmd.id}" class="flex-1 min-w-0 cursor-pointer">
						<div>
							<p class="text-body-sm font-medium" style="color: var(--text-primary);">
								{cmd.label}
							</p>
							<p
								class="text-caption font-mono truncate"
								style="color: var(--text-muted);"
								title={cmd.command}
							>
								{truncateCommand(cmd.command)}
							</p>
						</div>
					</label>
				</div>
			{/each}
		</div>
	{/if}

	<div class="flex gap-sm pt-md">
		<button
			type="button"
			class="btn-primary px-4 py-2 text-body-sm font-semibold"
			disabled={noneSelected}
			onclick={handleDeploy}
		>
			Deploy
		</button>
		<button
			type="button"
			class="btn-secondary px-4 py-2 text-body-sm"
			onclick={onCancel}
		>
			Cancel
		</button>
	</div>
</div>