<script lang="ts">
	import { base } from '$app/paths';
	import { cn } from '$lib/motion-core/utils/cn';
	import { invalidateAll } from '$app/navigation';

	let {
		open = false,
		onClose,
		onDeploying,
	}: {
		open: boolean;
		onClose: () => void;
		onDeploying?: (deploying: boolean) => void;
	} = $props();

	let dialogRef = $state<HTMLDialogElement | undefined>();
	let logContainer = $state<HTMLDivElement | undefined>();

	interface ProcessInfo {
		pm_id: string;
		name: string;
	}

	interface LogLine {
		type: string;
		pm_id?: string;
		name?: string;
		step?: string;
		line: string;
		isError: boolean;
		isComplete: boolean;
		success?: boolean;
		total?: number;
		processes?: ProcessInfo[];
		results?: Array<{ pm_id: string; name: string; success: boolean }>;
		needsApproval?: boolean;
		pendingPackages?: string[];
	}

	let lines = $state<LogLine[]>([]);
	let isDeploying = $state(false);
	let confirmed = $state(false);
	let deploySuccess = $state<boolean | null>(null);
	let totalProcesses = $state(0);
	let completedProcesses = $state(0);
	let processResults = $state<Array<{ pm_id: string; name: string; success: boolean }>>([]);
	let expandedProcesses = $state<Set<string>>(new Set());

	$effect(() => {
		if (open) {
			lines = [];
			isDeploying = false;
			confirmed = false;
			deploySuccess = null;
			totalProcesses = 0;
			completedProcesses = 0;
			processResults = [];
			expandedProcesses = new Set();
			dialogRef?.showModal();
		} else {
			dialogRef?.close();
		}
	});

	function confirmDeploy() {
		confirmed = true;
		isDeploying = true;
		onDeploying?.(true);
		startMultiDeploy();
	}

	// Auto-scroll
	$effect(() => {
		if (lines.length > 0 && logContainer) {
			const shouldScroll = logContainer.scrollTop + logContainer.clientHeight >= logContainer.scrollHeight - 20;
			if (shouldScroll) {
				requestAnimationFrame(() => {
					if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
				});
			}
		}
	});

	async function startMultiDeploy() {
		let lastStep = '';

		try {
			const res = await fetch(`${base}/api/deploy/all`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});

			if (res.status === 409) {
				const error = await res.json();
				lines = [{
					type: 'error',
					line: error.error || 'A multi-app deploy is already in progress',
					isError: true,
					isComplete: true,
					success: false,
				}];
				isDeploying = false;
				onDeploying?.(false);
				return;
			}

			if (!res.ok) {
				const error = await res.json();
				lines = [{
					type: 'error',
					line: `Failed to start deploy: ${error.error || 'Unknown error'}`,
					isError: true,
					isComplete: true,
					success: false,
				}];
				isDeploying = false;
				onDeploying?.(false);
				return;
			}

			const reader = res.body?.getReader();
			if (!reader) {
				lines = [{
					type: 'error',
					line: 'Streaming not supported',
					isError: true,
					isComplete: true,
					success: false,
				}];
				isDeploying = false;
				onDeploying?.(false);
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lineEnd = buffer.lastIndexOf('\n');
				if (lineEnd === -1) continue;

				const chunk = buffer.slice(0, lineEnd);
				buffer = buffer.slice(lineEnd + 1);

				for (const rawLine of chunk.split('\n')) {
					if (!rawLine.trim()) continue;
					try {
						const data = JSON.parse(rawLine) as LogLine;
						lines = [...lines, data];

						if (data.type === 'summary') {
							totalProcesses = data.total ?? 0;
						}

						if (data.type === 'process-complete') {
							completedProcesses++;
							if (data.pm_id && data.name !== undefined) {
								processResults = [...processResults, {
									pm_id: data.pm_id!,
									name: data.name!,
									success: data.success ?? false,
								}];
							}
						}

						if (data.isComplete && data.type === 'complete') {
							isDeploying = false;
							deploySuccess = data.success ?? false;
							onDeploying?.(false);
							if (data.success) {
								await invalidateAll();
							}
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		} catch (err) {
			lines = [...lines, {
				type: 'error',
				line: `Connection lost: ${err instanceof Error ? err.message : 'Unknown error'}`,
				isError: true,
				isComplete: true,
				success: false,
			}];
			deploySuccess = false;
			isDeploying = false;
			onDeploying?.(false);
		}
	}

	function handleClose() {
		onClose();
	}

	function toggleProcess(pmId: string) {
		const next = new Set(expandedProcesses);
		if (next.has(pmId)) {
			next.delete(pmId);
		} else {
			next.add(pmId);
		}
		expandedProcesses = next;
	}

	function getProcessStatus(pmId: string): 'pending' | 'running' | 'success' | 'error' {
		const result = processResults.find((r) => r.pm_id === pmId);
		if (result) return result.success ? 'success' : 'error';
		// Check if any log lines exist for this process
		const hasLogs = lines.some((l) => l.pm_id === pmId);
		return hasLogs ? 'running' : 'pending';
	}

	function getProcessLogs(pmId: string): LogLine[] {
		return lines.filter((l) => l.pm_id === pmId && l.type === 'log');
	}

	function statusIcon(status: string): string {
		switch (status) {
			case 'success': return '✓';
			case 'error': return '✗';
			case 'running': return '…';
			default: return '○';
		}
	}

	function statusColor(status: string): string {
		switch (status) {
			case 'success': return '#00E676';
			case 'error': return '#FF5B4F';
			case 'running': return '#0070F3';
			default: return 'var(--text-muted)';
		}
	}

	function statusBg(status: string): string {
		switch (status) {
			case 'success': return 'rgba(0, 230, 118, 0.15)';
			case 'error': return 'rgba(255, 91, 79, 0.15)';
			case 'running': return 'rgba(0, 112, 243, 0.15)';
			default: return 'var(--bg-base)';
		}
	}
</script>

{#if open}
	<dialog
		bind:this={dialogRef}
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: transparent; border: none;"
		onclose={handleClose}
	>
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0"
			style="background: rgba(0,0,0,0.6); border: none; cursor: pointer;"
			onclick={handleClose}
			aria-label="Close modal"
		></button>

		<!-- Modal content -->
		<div
			class="relative w-full max-w-3xl rounded-xl shadow-2xl"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			{#if !confirmed}
				<!-- Confirmation prompt -->
				<div class="p-lg">
					<div class="flex items-center gap-md mb-lg">
						<div
							class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
							style="background: rgba(255, 215, 64, 0.15);"
						>
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FFD740;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z"/>
							</svg>
						</div>
						<div>
							<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
								Deploy All Apps
							</h3>
							<p class="text-caption" style="color: var(--text-muted);">
								This will deploy all online applications sequentially
							</p>
						</div>
					</div>

					<p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
						Are you sure you want to deploy all apps? This action will restart every online process one by one.
					</p>

					<div class="flex gap-sm justify-end">
						<button
							type="button"
							class="btn-secondary px-3 py-1.5 text-body-sm"
							onclick={handleClose}
						>
							Cancel
						</button>
						<button
							type="button"
							class="btn-primary px-3 py-1.5 text-body-sm inline-flex items-center gap-1.5"
							onclick={confirmDeploy}
						>
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m9-13V1a1 1 0 00-1 1v2.582a5.009 5.009 0 00-3.412 1.918m7.422 2.476V4a1 1 0 00-2 0v1.582"/>
							</svg>
							Yes, Deploy All
						</button>
					</div>
				</div>
			{:else}
				<!-- Deploy progress (shown after confirmation) -->
				<!-- Header -->
				<div class="flex items-center justify-between p-lg pb-0">
					<div class="flex items-center gap-md">
						<div
							class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
							style="background: {deploySuccess === true ? 'rgba(0, 230, 118, 0.15)' : deploySuccess === false ? 'rgba(255, 91, 79, 0.15)' : 'rgba(0, 112, 243, 0.15)'};"
						>
							{#if isDeploying}
							<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #0070F3;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
							</svg>
						{:else if deploySuccess === true}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #00E676;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
						{:else if deploySuccess === false}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5B4F;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						{:else}
							<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #0070F3;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
							</svg>
						{/if}
					</div>
					<div>
						<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
							Deploy All Apps
						</h3>
						<p class="text-caption" style="color: var(--text-muted);">
							{#if totalProcesses > 0}
								{completedProcesses}/{totalProcesses} apps deployed
							{:else}
								Discovering processes to deploy...
							{/if}
						</p>
					</div>
				</div>

				<!-- Close button (only when done) -->
				{#if !isDeploying && deploySuccess !== null}
					<button
						type="button"
						class="btn-secondary px-3 py-1.5 text-caption"
						onclick={handleClose}
					>
						Close
					</button>
				{/if}
			</div>

			<!-- Progress bar -->
			{#if totalProcesses > 0}
				<div class="px-lg pt-md">
					<div class="w-full h-2 rounded-full" style="background: var(--bg-base);">
						<div
							class="h-2 rounded-full transition-all duration-300"
							style="width: {(completedProcesses / totalProcesses) * 100}%; background: {deploySuccess === false && completedProcesses < totalProcesses ? '#FF5B4F' : '#00E676'};"
						></div>
					</div>
				</div>
			{/if}

			<!-- Process list -->
			{#if lines.some((l) => l.type === 'summary')}
				<div class="px-lg pt-md">
					{#each (lines.find((l) => l.type === 'summary')?.processes ?? []) as proc}
						{@const status = getProcessStatus(proc.pm_id)}
						{@const logs = getProcessLogs(proc.pm_id)}
						{@const isExpanded = expandedProcesses.has(proc.pm_id)}
						<div
							class="mb-xs rounded-lg"
							style="background: var(--bg-base); border: 1px solid var(--border-color);"
						>
							<!-- Process header (clickable to expand) -->
							<button
								class="w-full flex items-center gap-sm px-md py-sm text-left"
								onclick={() => toggleProcess(proc.pm_id)}
							>
								<!-- Status icon -->
								<span
									class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
									style="background: {statusBg(status)}; color: {statusColor(status)};"
								>
									{#if status === 'running' && isDeploying}
										<svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
										</svg>
									{:else}
										{statusIcon(status)}
									{/if}
								</span>
								<span class="text-body-sm font-medium flex-1" style="color: var(--text-primary);">
									{proc.name}
								</span>
								<!-- Chevron -->
								<svg
									class="w-4 h-4 transition-transform flex-shrink-0"
									style="color: var(--text-muted); transform: {isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
								</svg>
							</button>

							<!-- Expandable logs -->
							{#if isExpanded && logs.length > 0}
								<div
									class="px-md pb-sm font-mono text-code max-h-[200px] overflow-y-auto scrollbar-thin"
									style="background: var(--bg-surface); border-top: 1px solid var(--border-color);"
								>
									{#each logs as log}
										<div
											class="py-2xs text-xs"
											style={cn(
												'color: var(--text-secondary);',
												log.isError ? 'color: #FF5B4F;' : '',
												log.line.includes('Starting') ? 'color: #0070F3; font-weight: 600;' : '',
												log.line.includes('Completed') ? 'color: #00E676; font-weight: 600;' : '',
												log.line.includes('Skipped') ? 'color: #FFD740; font-weight: 600;' : '',
												log.line.includes('Failed') ? 'color: #FF5B4F; font-weight: 600;' : ''
											)}
										>
											{log.line}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- Full log output (always visible) -->
			<div
				bind:this={logContainer}
				class="rounded-lg m-lg mt-sm p-md font-mono text-code overflow-x-auto max-h-[300px] overflow-y-auto scrollbar-thin"
				style="background: var(--bg-base); border: 1px solid var(--border-color);"
			>
				{#if lines.length === 0}
					<p class="text-center py-xl" style="color: var(--text-muted);">
						Starting multi-app deploy...
					</p>
				{:else}
					{#each lines as log}
						{#if log.type === 'summary'}
							<div class="py-2xs font-semibold" style="color: #0070F3;">
								{log.line ?? `Deploying ${log.total} apps...`}
							</div>
						{:else if log.type === 'process-start'}
							<div class="py-2xs font-semibold" style="color: #0070F3;">
								─── Deploying: {log.name} ───
							</div>
						{:else if log.type === 'process-complete'}
							<div
								class="py-2xs font-semibold"
								style="color: {log.success ? '#00E676' : '#FF5B4F'};"
							>
								─── {log.name}: {log.success ? 'Deployed successfully' : 'Failed'} ───
							</div>
						{:else if log.type === 'complete'}
							<div
								class="py-2xs font-semibold"
								style="color: {log.success ? '#00E676' : '#FF5B4F'};"
							>
								{log.line}
							</div>
						{:else if log.type === 'error'}
							<div class="py-2xs font-semibold" style="color: #FF5B4F;">
								{log.line}
							</div>
						{/if}
					{/each}
				{/if}
			</div>
			{/if}
		</div>
	</dialog>
{/if}
