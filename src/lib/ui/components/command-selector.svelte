<script lang="ts">
	import type { DeployConfig, DeployCommand } from '$lib/deploy-config/deploy-config.types';

	let {
		config,
		onSelect,
		onCancel,
	}: {
		config: DeployConfig;
		onSelect: (selectedRestartId: string) => void;
		onCancel: () => void;
	} = $props();

	// Single restart command selected - use $effect to sync with prop changes
	let selectedRestartId = $state<string>('');

	$effect(() => {
		// Default to first restart command if available
		selectedRestartId = config.restart.length > 0 ? config.restart[0].id : '';
	});

	function handleDeploy() {
		if (selectedRestartId) {
			onSelect(selectedRestartId);
		}
	}

	function truncateCommand(cmd: string, maxLen = 80): string {
		if (cmd.length <= maxLen) return cmd;
		return cmd.slice(0, maxLen) + '...';
	}
</script>

<div class="space-y-lg">
	<div class="mb-md">
		<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
			Deploy Configuration
		</h3>
		<p class="text-caption" style="color: var(--text-muted);">
			Review and select which commands to run during this deploy
		</p>
	</div>

	<!-- Install Command -->
	{#if config.install.length > 0}
		{@const cmd = config.install[0]}
		<div class="space-y-xs">
			<h4 class="text-body-sm font-semibold" style="color: var(--text-primary);">
				Install Command
			</h4>
			<div
				class="p-sm rounded-md"
				style="background: var(--bg-surface); border: 1px solid var(--border-color);"
			>
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
		</div>
	{/if}

	<!-- Build Command -->
	{#if config.build.length > 0}
		{@const cmd = config.build[0]}
		<div class="space-y-xs">
			<h4 class="text-body-sm font-semibold" style="color: var(--text-primary);">
				Build Command
			</h4>
			<div
				class="p-sm rounded-md"
				style="background: var(--bg-surface); border: 1px solid var(--border-color);"
			>
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
		</div>
	{/if}

	<!-- Restart Commands -->
	{#if config.restart.length > 0}
		<div class="space-y-xs">
			<h4 class="text-body-sm font-semibold" style="color: var(--text-primary);">
				Restart Command
			</h4>
			<p class="text-caption" style="color: var(--text-muted);">
				Choose which restart command to run during this deploy
			</p>

			<div class="space-y-xs">
				<!-- Individual command radio buttons -->
				{#each config.restart as cmd (cmd.id)}
					<div
						class="flex items-center gap-sm p-sm rounded-md"
						style="background: var(--bg-surface); border: 1px solid var(--border-color);"
					>
						<input
							type="radio"
							id="restart-{cmd.id}"
							name="restart-command"
							value={cmd.id}
							bind:group={selectedRestartId}
							class="w-4 h-4"
							style="accent-color: #0070F3;"
						/>
						<label for="restart-{cmd.id}" class="flex-1 min-w-0 cursor-pointer">
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
		</div>
	{/if}

	<div class="flex gap-sm pt-md">
		<button
			type="button"
			class="btn-primary px-4 py-2 text-body-sm font-semibold"
			disabled={!selectedRestartId}
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