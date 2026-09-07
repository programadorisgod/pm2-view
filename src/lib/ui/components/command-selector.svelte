<script lang="ts">
	import type { DeployConfig, DeployCommand } from '$lib/deploy-config/deploy-config.types';

	let {
		config,
		onSelect,
		onCancel,
	}: {
		config: DeployConfig;
		onSelect: (selectedId: string, isStart?: boolean) => void;
		onCancel: () => void;
	} = $props();

	// Selected command ID and whether it's a start command
	let selectedCommandId = $state<string>('');
	let isStartCommand = $state<boolean>(false);

	$effect(() => {
		if (config.start && config.start.length > 0) {
			selectedCommandId = config.start[0].id;
			isStartCommand = true;
		} else if (config.restart && config.restart.length > 0) {
			selectedCommandId = config.restart[0].id;
			isStartCommand = false;
		} else {
			selectedCommandId = '';
			isStartCommand = false;
		}
	});

	function handleDeploy() {
		if (selectedCommandId) {
			onSelect(selectedCommandId, isStartCommand);
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
	{#if config.install && config.install.length > 0}
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
	{#if config.build && config.build.length > 0}
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

	<!-- Start Commands -->
	{#if config.start && config.start.length > 0}
		<div class="space-y-xs">
			<h4 class="text-body-sm font-semibold" style="color: var(--text-primary);">
				Start Command
			</h4>
			<p class="text-caption" style="color: var(--text-muted);">
				Choose which start command to run during this deploy
			</p>

			<div class="space-y-xs">
				{#each config.start as cmd (cmd.id)}
					<div
						class="flex items-center gap-sm p-sm rounded-md"
						style="background: var(--bg-surface); border: 1px solid var(--border-color);"
					>
						<input
							type="radio"
							id="start-{cmd.id}"
							name="deploy-cmd"
							value={cmd.id}
							checked={selectedCommandId === cmd.id}
							onchange={() => { selectedCommandId = cmd.id; isStartCommand = true; }}
							class="w-4 h-4"
							style="accent-color: #0070F3;"
						/>
						<label for="start-{cmd.id}" class="flex-1 min-w-0 cursor-pointer">
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

	<!-- Restart Commands -->
	{#if config.restart && config.restart.length > 0}
		<div class="space-y-xs">
			<h4 class="text-body-sm font-semibold" style="color: var(--text-primary);">
				Restart Command
			</h4>
			<p class="text-caption" style="color: var(--text-muted);">
				Choose which restart command to run during this deploy
			</p>

			<div class="space-y-xs">
				{#each config.restart as cmd (cmd.id)}
					<div
						class="flex items-center gap-sm p-sm rounded-md"
						style="background: var(--bg-surface); border: 1px solid var(--border-color);"
					>
						<input
							type="radio"
							id="restart-{cmd.id}"
							name="deploy-cmd"
							value={cmd.id}
							checked={selectedCommandId === cmd.id}
							onchange={() => { selectedCommandId = cmd.id; isStartCommand = false; }}
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
			disabled={!selectedCommandId}
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