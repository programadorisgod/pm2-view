<script lang="ts">
	import { base } from '$app/paths';
	import { cn } from '$lib/motion-core/utils/cn';
	import { invalidateAll } from '$app/navigation';

	let {
		open = false,
		pmId,
		processName,
		onClose,
		onDeploying,
	}: {
		open: boolean;
		pmId: string;
		processName: string;
		onClose: () => void;
		onDeploying?: (deploying: boolean) => void;
	} = $props();

	let dialogRef = $state<HTMLDialogElement | undefined>();
	let logContainer = $state<HTMLDivElement | undefined>();

	interface LogLine {
		step: string;
		line: string;
		isError: boolean;
		isComplete: boolean;
		success?: boolean;
	}

	let lines = $state<LogLine[]>([]);
	let isDeploying = $state(false);
	let isRestarting = $state(false);
	let deploySuccess = $state<boolean | null>(null);

	$effect(() => {
		if (open) {
			lines = [];
			isDeploying = true;
			isRestarting = false;
			deploySuccess = null;
			dialogRef?.showModal();
			onDeploying?.(true);
			startDeploy();
		} else {
			dialogRef?.close();
		}
	});

	// Auto-scroll while deploying or receiving new lines
	$effect(() => {
		if (lines.length > 0) {
			requestAnimationFrame(() => {
				if (logContainer) {
					logContainer.scrollTop = logContainer.scrollHeight;
				}
			});
		}
	});

	async function startDeploy() {
		let lastStep = '';
		let streamDisconnected = false;

		try {
			const res = await fetch(`${base}/api/deploy`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pm_id: pmId }),
			});

			if (res.status === 409) {
				const error = await res.json();
				lines = [{
					step: 'error',
					line: error.error || 'A deploy is already in progress',
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
					step: 'error',
					line: `Failed to start deploy: ${error.error || 'Unknown error'}`,
					isError: true,
					isComplete: true,
					success: false,
				}];
				isDeploying = false;
				onDeploying?.(false);
				return;
			}

			// Read the stream line by line
			const reader = res.body?.getReader();
			if (!reader) {
				lines = [{
					step: 'error',
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
						lastStep = data.step;
						lines = [...lines, data];

						if (data.isComplete) {
							isDeploying = false;
							deploySuccess = data.success ?? false;
							onDeploying?.(false);
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		} catch (err) {
			// Stream disconnected — likely server restarting
			streamDisconnected = true;

			// If we were at the restart step, the server is coming back
			if (lastStep === 'restart') {
				lines = [...lines, {
					step: 'restart',
					line: '─── Server restarting, please wait... ───',
					isError: false,
					isComplete: false,
				}];
				isRestarting = true;

				// Poll until the server is back
				const backOnline = await waitForServer();

				isRestarting = false;

				if (backOnline) {
					lines = [...lines, {
						step: 'restart',
						line: '─── Server is back online ───',
						isError: false,
						isComplete: false,
					}];

					// Mark deploy as successful (restart was the last step)
					lines = [...lines, {
						step: 'complete',
						line: 'Deploy completed successfully',
						isError: false,
						isComplete: true,
						success: true,
					}];
					deploySuccess = true;

					// Refresh page data
					await invalidateAll();
				} else {
					lines = [...lines, {
						step: 'complete',
						line: 'Server did not come back online. Check PM2 logs.',
						isError: true,
						isComplete: true,
						success: false,
					}];
					deploySuccess = false;
				}
			} else {
				// Disconnect at an earlier step = actual error
				lines = [...lines, {
					step: 'error',
					line: `Connection lost: ${err instanceof Error ? err.message : 'Unknown error'}`,
					isError: true,
					isComplete: true,
					success: false,
				}];
				deploySuccess = false;
			}

			isDeploying = false;
			onDeploying?.(false);
		}
	}

	/** Poll the server until it responds or timeout */
	async function waitForServer(timeoutMs = 30000, intervalMs = 1000): Promise<boolean> {
		const start = Date.now();

		while (Date.now() - start < timeoutMs) {
			try {
				const res = await fetch(`${base}/`, {
					method: 'HEAD',
					signal: AbortSignal.timeout(3000),
				});
				if (res.ok || res.status === 302 || res.status === 401) {
					return true;
				}
			} catch {
				// Server not ready yet
			}
			await new Promise((r) => setTimeout(r, intervalMs));
		}

		return false;
	}

	function handleClose() {
		onClose();
	}

	function stepLabel(step: string): string {
		const labels: Record<string, string> = {
			'git-pull': 'Git Pull',
			'install': 'Install Dependencies',
			'build': 'Build',
			'restart': 'PM2 Restart',
			'complete': 'Complete',
			'error': 'Error',
		};
		return labels[step] ?? step;
	}

	function stepIcon(step: string): string {
		if (step === 'complete') {
			return deploySuccess ? '✓' : '✗';
		}
		if (step === 'error') return '✗';

		// Check if this step has completed
		const stepLines = lines.filter((l) => l.step === step);
		const hasCompletion = stepLines.some((l) => l.line.includes('Completed') || l.line.includes('Failed') || l.line.includes('Skipped') || l.line.includes('back online'));
		const hasError = stepLines.some((l) => l.isError && l.line.includes('Failed'));

		if (hasCompletion) return hasError ? '✗' : '✓';
		return '…';
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
			class="relative w-full max-w-2xl rounded-xl shadow-2xl"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-lg pb-0">
				<div class="flex items-center gap-md">
					<div
						class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
						style="background: {deploySuccess === true ? 'rgba(0, 230, 118, 0.15)' : deploySuccess === false ? 'rgba(255, 82, 82, 0.15)' : 'rgba(56, 205, 255, 0.15)'};"
					>
						{#if isRestarting}
							<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FFD740;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
							</svg>
						{:else if deploySuccess === true}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #00E676;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
						{:else if deploySuccess === false}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5252;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						{:else}
							<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
							</svg>
						{/if}
					</div>
					<div>
						<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
							Deploy: {processName}
						</h3>
						<p class="text-caption" style="color: var(--text-muted);">
							{isRestarting ? 'Server restarting...' : isDeploying ? 'Running deployment pipeline...' : deploySuccess ? 'Deploy completed' : 'Deploy failed'}
						</p>
					</div>
				</div>

				<!-- Close button (only when done) -->
				{#if !isDeploying && !isRestarting}
					<button
						type="button"
						class="btn-secondary px-3 py-1.5 text-caption"
						onclick={handleClose}
					>
						Close
					</button>
				{/if}
			</div>

			<!-- Step indicators -->
			<div class="flex gap-sm px-lg pt-md">
				{#each ['git-pull', 'install', 'build', 'restart'] as step}
					<div
						class="flex items-center gap-xs px-sm py-2xs rounded-md text-caption font-medium"
						style={cn(
							'background: var(--bg-base); border: 1px solid var(--border-color);',
							lines.some((l) => l.step === step) ? 'border-color: #38CDFF;' : ''
						)}
					>
						<span
							class="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
							style={cn(
								'background: var(--bg-surface); color: var(--text-muted);',
								stepIcon(step) === '✓' ? 'background: rgba(0, 230, 118, 0.2); color: #00E676;' : '',
								stepIcon(step) === '✗' ? 'background: rgba(255, 82, 82, 0.2); color: #FF5252;' : '',
								stepIcon(step) === '…' ? 'background: rgba(56, 205, 255, 0.2); color: #38CDFF;' : ''
							)}
						>
							{stepIcon(step)}
						</span>
						<span style="color: var(--text-secondary);">{stepLabel(step)}</span>
					</div>
				{/each}
			</div>

			<!-- Log output -->
			<div
				bind:this={logContainer}
				class="rounded-lg m-lg mt-sm p-md font-mono text-code overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin"
				style="background: var(--bg-base); border: 1px solid var(--border-color);"
			>
				{#if lines.length === 0}
					<p class="text-center py-xl" style="color: var(--text-muted);">
						Starting deploy...
					</p>
				{:else}
					{#each lines as log}
						<div
							class="py-2xs"
							style={cn(
								'color: var(--text-secondary);',
								log.isError ? 'color: #FF5252;' : '',
								log.line.includes('Starting') ? 'color: #38CDFF; font-weight: 600;' : '',
								log.line.includes('Completed') ? 'color: #00E676; font-weight: 600;' : '',
								log.line.includes('Skipped') ? 'color: #FFD740; font-weight: 600;' : '',
								log.line.includes('restarting') ? 'color: #FFD740; font-weight: 600;' : '',
								log.line.includes('back online') ? 'color: #00E676; font-weight: 600;' : '',
								log.line.includes('Failed') ? 'color: #FF5252; font-weight: 600;' : ''
							)}
						>
							{log.line}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</dialog>
{/if}
