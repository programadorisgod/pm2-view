<script lang="ts">
import { base } from '$app/paths';
import { cn } from '$lib/motion-core/utils/cn';
import { invalidateAll } from '$app/navigation';
import { browser } from '$app/environment';
import type { GitHubRepoDTO } from '$lib/github/github.types';

	let {
		open = false,
		repository,
		reposPath = '/opt/repos',
		onClose,
		onSuccess,
	}: {
		open: boolean;
		repository: GitHubRepoDTO | null;
		reposPath?: string;
		onClose: () => void;
		onSuccess?: (processName: string) => void;
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

	// View states: config → cloning → selecting → starting
	let view = $state<'config' | 'cloning' | 'selecting' | 'env' | 'starting'>('config');
	let targetPath = $state('');
	let processName = $state('');
	let installCommand = $state<string | undefined>(undefined);
	let buildCommand = $state<string | undefined>(undefined);
	let showAdvanced = $state(false);

	let lines = $state<LogLine[]>([]);
	let ecosystemFiles = $state<string[]>([]);
	let selectedEcosystemFile = $state<string | null>(null);
	let isRunning = $state(false);
	let importSuccess = $state<boolean | null>(null);
	let startSuccess = $state<boolean | null>(null);
	let approvalPending = $state(false);
	let approvalPackages = $state<string[]>([]);
	let envMode = $state<'upload' | 'paste'>('paste');
	let envText = $state('');
	let envVars = $state<Record<string, string>>({});
	let envFileCount = $state(0);

	$effect(() => {
		if (open && repository) {
			// Initialize defaults
			targetPath = `${reposPath}/${repository.name}`;
			processName = repository.name;
			lines = [];
			ecosystemFiles = [];
			selectedEcosystemFile = null;
			installCommand = undefined;
			buildCommand = undefined;
			showAdvanced = false;
			view = 'config';
			isRunning = false;
			importSuccess = null;
			startSuccess = null;
		approvalPending = false;
		approvalPackages = [];
		envMode = 'paste';
		envText = '';
		envVars = {};
		envFileCount = 0;
			dialogRef?.showModal();
		} else {
			dialogRef?.close();
		}
	});

	// Auto-scroll while running or receiving new lines
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

	async function handleCloneAndInstall() {
		if (!repository) return;

		// Validate inputs
		if (!targetPath.trim()) {
			lines = [{
				step: 'error',
				line: 'Target directory is required',
				isError: true,
				isComplete: true,
			}];
			return;
		}

		if (!targetPath.startsWith('/')) {
			lines = [{
				step: 'error',
				line: 'Target directory must be an absolute path (must start with /)',
				isError: true,
				isComplete: true,
			}];
			return;
		}

		if (!processName.trim()) {
			lines = [{
				step: 'error',
				line: 'Process name is required',
				isError: true,
				isComplete: true,
			}];
			return;
		}

		view = 'cloning';
		isRunning = true;
		lines = [];

		try {
			const body: Record<string, string | undefined> = {
				targetPath,
				processName,
			};
			if (installCommand) body.installCommand = installCommand;
			if (buildCommand) body.buildCommand = buildCommand;

			const res = await fetch(`${base}/api/github/repositories/${repository.id}/import`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

			// Handle validation/auth errors (still JSON responses)
			if (!res.ok) {
				const error = await res.json();
				lines = [{
					step: 'error',
					line: error.error || 'Import failed',
					isError: true,
					isComplete: true,
				}];
				isRunning = false;
				importSuccess = false;
				return;
			}

			// Read NDJSON stream
			const reader = res.body?.getReader();
			if (!reader) {
				lines = [{
					step: 'error',
					line: 'Streaming not supported',
					isError: true,
					isComplete: true,
				}];
				isRunning = false;
				importSuccess = false;
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
						const data = JSON.parse(rawLine);
						lines = [...lines, data];

						if (data.isComplete) {
							if (data.needsApproval) {
								targetPath = data.targetPath || targetPath;
								approvalPending = true;
								approvalPackages = data.pendingPackages ?? [];
								isRunning = false;
							} else {
								isRunning = false;
								importSuccess = data.success ?? false;

								if (data.success) {
									targetPath = data.targetPath || targetPath;
									ecosystemFiles = data.ecosystemFiles || [];

									// Use ecosystem app name as default process name if available
									const ecosystemAppNames = data.ecosystemAppNames || [];
									if (ecosystemAppNames.length > 0) {
										processName = ecosystemAppNames[0];
									}

									if (ecosystemFiles.length > 0) {
										selectedEcosystemFile = ecosystemFiles[0];
										view = 'selecting';
									} else {
										selectedEcosystemFile = '';
										view = 'selecting';
									}
								}
							}
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		} catch (err) {
			lines = [{
				step: 'error',
				line: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
				isError: true,
				isComplete: true,
			}];
			isRunning = false;
			importSuccess = false;
		}
	}

	async function handleApproveAndContinue() {
		approvalPending = false;
		view = 'cloning';
		isRunning = true;
		lines = [];

		try {
			const res = await fetch(`${base}/api/github/repositories/${repository!.id}/approve-builds`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetPath,
					processName,
					installCommand,
					buildCommand,
				}),
			});

			if (!res.ok) {
				const error = await res.json();
				lines = [{
					step: 'error',
					line: `Approval failed: ${error.error || 'Unknown error'}`,
					isError: true,
					isComplete: true,
				}];
				isRunning = false;
				importSuccess = false;
				return;
			}

			// Read NDJSON stream
			const reader = res.body?.getReader();
			if (!reader) {
				lines = [{
					step: 'error',
					line: 'Streaming not supported',
					isError: true,
					isComplete: true,
				}];
				isRunning = false;
				importSuccess = false;
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
						const data = JSON.parse(rawLine);
						lines = [...lines, data];

						if (data.isComplete) {
							isRunning = false;
							importSuccess = data.success ?? false;

							if (data.success) {
								targetPath = data.targetPath || targetPath;
								ecosystemFiles = data.ecosystemFiles || [];
								if (ecosystemFiles.length > 0) {
									selectedEcosystemFile = ecosystemFiles[0];
									view = 'selecting';
								} else {
									selectedEcosystemFile = '';
									view = 'selecting';
								}
							}
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		} catch (err) {
			lines = [{
				step: 'error',
				line: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
				isError: true,
				isComplete: true,
			}];
			isRunning = false;
			importSuccess = false;
		}
	}

	function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			envText = reader.result as string;
			envFileCount = 1;
		};
		reader.readAsText(file);
	}

	async function handleWriteEnv() {
		if (!repository) return;

		// Parse env vars from text
		const parsed: Record<string, string> = {};
		for (const rawLine of envText.split('\n')) {
			const line = rawLine.trim();
			if (!line || line.startsWith('#')) continue;
			const eqIndex = line.indexOf('=');
			if (eqIndex === -1) continue;
			const key = line.slice(0, eqIndex).trim();
			if (!key) continue;
			let value = line.slice(eqIndex + 1).trim();
			// Remove quotes
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}
			parsed[key] = value;
		}

		// Merge with uploaded file vars
		const merged = { ...envVars, ...parsed };

		view = 'cloning';
		isRunning = true;
		lines = [];

		try {
			const res = await fetch(`${base}/api/github/repositories/${repository.id}/write-env`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetPath,
					envVars: merged,
				}),
			});

			const result = await res.json();

			if (!res.ok) {
				lines = [{
					step: 'error',
					line: result.error || 'Failed to write env file',
					isError: true,
					isComplete: true,
				}];
				isRunning = false;
				importSuccess = false;
				view = 'env';
				return;
			}

			lines = [{
				step: 'complete',
				line: `Wrote ${result.varCount} environment variables to .env`,
				isError: false,
				isComplete: true,
				success: true,
			}];

			// Continue to PM2 start
			isRunning = false;
			await handleStartPM2();
		} catch (err) {
			lines = [{
				step: 'error',
				line: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
				isError: true,
				isComplete: true,
			}];
			isRunning = false;
			importSuccess = false;
			view = 'env';
		}
	}

	async function handleStartPM2() {
		if (!repository || !selectedEcosystemFile) return;

		view = 'starting';
		isRunning = true;
		lines = [];

		try {
			const res = await fetch(`${base}/api/github/repositories/${repository.id}/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetPath,
					processName,
					ecosystemFile: selectedEcosystemFile,
				}),
			});

			if (!res.ok) {
				const error = await res.json();
				lines = [{
					step: 'error',
					line: error.error || 'Failed to start process',
					isError: true,
					isComplete: true,
				}];
				isRunning = false;
				startSuccess = false;
				return;
			}

			// Read the stream
			const reader = res.body?.getReader();
			if (!reader) {
				lines = [{
					step: 'error',
					line: 'Streaming not supported',
					isError: true,
					isComplete: true,
				}];
				isRunning = false;
				startSuccess = false;
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

						if (data.isComplete) {
							isRunning = false;
							startSuccess = data.success ?? false;
							if (data.success && processName) {
								onSuccess?.(processName);
							}
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		} catch (err) {
			lines = [{
				step: 'error',
				line: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
				isError: true,
				isComplete: true,
			}];
			isRunning = false;
			startSuccess = false;
		}
	}

	function handleClose() {
		if (!isRunning) {
			onClose();
		}
	}

	function stepLabel(step: string): string {
		const labels: Record<string, string> = {
			'clone': 'Clone',
			'install': 'Install',
			'approve': 'Approve',
			'build': 'Build',
			'ecosystem': 'Ecosystem',
			'env': 'Env',
			'pm2-start': 'PM2 Start',
			'complete': 'Complete',
			'error': 'Error',
		};
		return labels[step] ?? step;
	}

	function stepIcon(step: string): string {
		if (step === 'complete') {
			return startSuccess !== null ? (startSuccess ? '✓' : '✗') : (importSuccess ? '✓' : '✗');
		}
		if (step === 'error') return '✗';

		const stepLines = lines.filter((l) => l.step === step);
		const hasCompletion = stepLines.some((l) => l.line.includes('Completed') || l.line.includes('Failed') || l.line.includes('Skipped'));
		const hasError = stepLines.some((l) => l.isError && l.line.includes('Failed'));

		if (hasCompletion) return hasError ? '✗' : '✓';
		return '…';
	}

	function currentStep(): string {
		if (view === 'config') return 'Configuration';
		if (view === 'cloning') return 'Cloning & Installing';
		if (view === 'selecting') return 'Select Ecosystem';
		if (view === 'starting') return 'Starting PM2';
		return '';
	}
</script>

{#if browser && open && repository}
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
			disabled={isRunning}
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
						style="background: {startSuccess === true ? 'rgba(0, 230, 118, 0.15)' : startSuccess === false ? 'rgba(255, 82, 82, 0.15)' : 'rgba(56, 205, 255, 0.15)'};"
					>
						{#if isRunning}
							<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
							</svg>
						{:else if startSuccess === true || importSuccess === true}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #00E676;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
						{:else if startSuccess === false || importSuccess === false}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5252;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						{:else}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
							</svg>
						{/if}
					</div>
					<div>
						<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
							Import: {repository.name}
						</h3>
						<p class="text-caption" style="color: var(--text-muted);">
							{currentStep()}
						</p>
					</div>
				</div>

				<!-- Close button -->
				{#if !isRunning && view === 'config' || !isRunning && (view === 'selecting' && startSuccess !== null) || !isRunning && view === 'starting'}
					<button
						type="button"
						class="btn-secondary px-3 py-1.5 text-caption"
						onclick={handleClose}
					>
						Close
					</button>
				{/if}
			</div>

			<!-- Config View -->
			{#if view === 'config'}
				<div class="p-lg space-y-md">
					<!-- Target Directory -->
					<div>
						<label for="targetPath" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">
							Target Directory <span class="text-red-500">*</span>
						</label>
						<input
							id="targetPath"
							type="text"
							bind:value={targetPath}
							placeholder="/opt/repos/my-app"
							class="w-full px-md py-sm rounded-lg text-body-sm"
							style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
						/>
						<p class="text-caption-xs mt-xs" style="color: var(--text-muted);">
							Absolute path where the repository will be cloned
						</p>
					</div>

					<!-- Process Name -->
					<div>
						<label for="processName" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">
							Process Name <span class="text-red-500">*</span>
						</label>
						<input
							id="processName"
							type="text"
							bind:value={processName}
							placeholder="my-app"
							class="w-full px-md py-sm rounded-lg text-body-sm"
							style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
						/>
						<p class="text-caption-xs mt-xs" style="color: var(--text-muted);">
							Name for the PM2 process
						</p>
					</div>

					<!-- Advanced Toggle -->
					<div>
						<button
							type="button"
							class="flex items-center gap-xs text-caption"
							style="color: var(--text-muted);"
							onclick={() => showAdvanced = !showAdvanced}
						>
							<svg
								class="w-4 h-4 transition-transform"
								class:rotate-90={showAdvanced}
								fill="none" stroke="currentColor" viewBox="0 0 24 24"
							>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
							</svg>
							Advanced Options
						</button>

						{#if showAdvanced}
							<div class="mt-md space-y-md pl-md border-l-2" style="border-color: var(--border-color);">
								<!-- Custom Install Command -->
								<div>
									<label for="installCommand" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">
										Custom Install Command
									</label>
									<input
										id="installCommand"
										type="text"
										bind:value={installCommand}
										placeholder="pnpm install (optional)"
										class="w-full px-md py-sm rounded-lg text-body-sm"
										style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
									/>
								</div>

								<!-- Custom Build Command -->
								<div>
									<label for="buildCommand" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">
										Custom Build Command
									</label>
									<input
										id="buildCommand"
										type="text"
										bind:value={buildCommand}
										placeholder="pnpm run build (optional)"
										class="w-full px-md py-sm rounded-lg text-body-sm"
										style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
									/>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Config Actions -->
				<div class="flex justify-end gap-sm p-lg pt-0">
					<button
						type="button"
						class="btn-secondary px-4 py-2 text-caption"
						onclick={handleClose}
					>
						Cancel
					</button>
					<button
						type="button"
						class="btn-primary px-4 py-2 text-caption font-semibold"
						style="background: #38CDFF; color: #1a1a2e;"
						onclick={handleCloneAndInstall}
					>
						Clone & Install
					</button>
				</div>
			{/if}

			<!-- Cloning/Installing View -->
			{#if view === 'cloning' || view === 'starting'}
				<!-- Step indicators -->
				<div class="flex gap-sm px-lg pt-md">
					{#each ['clone', 'install', 'approve', 'build', 'ecosystem'] as step}
						<div
							class="flex items-center gap-xs px-sm py-2xs rounded-md text-caption font-medium"
							class:rounded-md={true}
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
							Starting...
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
									log.line.includes('Failed') ? 'color: #FF5252; font-weight: 600;' : ''
								)}
							>
								{log.line}
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			<!-- Approval Pending View -->
			{#if approvalPending}
				<div class="px-lg pt-md">
					<div
						class="rounded-lg p-md"
						style="background: rgba(255, 215, 64, 0.1); border: 1px solid rgba(255, 215, 64, 0.3);"
					>
						<p class="text-caption font-semibold" style="color: #FFD740; margin-bottom: 8px;">
							Native builds require approval
						</p>
						<p class="text-caption" style="color: var(--text-secondary); margin-bottom: 12px;">
							These packages need to compile native code. Approve to continue:
						</p>
						<ul class="pl-lg list-disc" style="color: var(--text-primary); margin-bottom: 16px;">
							{#each approvalPackages as pkg}
								<li class="font-mono text-code">{pkg}</li>
							{/each}
						</ul>
						<div class="flex gap-sm">
							<button
								class="btn-primary px-4 py-2 text-caption font-semibold"
								style="background: #FFD740; color: #1a1a2e;"
								onclick={handleApproveAndContinue}
							>
								Approve & Continue
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Selecting Ecosystem View -->
			{#if view === 'selecting' && !isRunning}
				<div class="p-lg space-y-md">
					{#if ecosystemFiles.length > 0}
						<div>
							<p class="text-caption font-medium mb-sm" style="color: var(--text-secondary);">
								Select an ecosystem file to start with PM2:
							</p>
							<div class="space-y-xs">
								{#each ecosystemFiles as file}
									<label
										class="flex items-center gap-sm p-sm rounded-lg cursor-pointer"
										style="background: var(--bg-base); border: 1px solid var(--border-color);"
									>
										<input
											type="radio"
											name="ecosystem"
											value={file}
											checked={selectedEcosystemFile === file}
											onchange={() => selectedEcosystemFile = file}
											class="w-4 h-4"
										/>
										<span class="text-body-sm font-mono" style="color: var(--text-primary);">
											{file}
										</span>
									</label>
								{/each}
							</div>
						</div>
					{:else}
					<div
						class="p-md rounded-lg text-center"
						style="background: rgba(255, 215, 64, 0.1); border: 1px solid rgba(255, 215, 64, 0.3);"
					>
						<p class="text-caption" style="color: #FFD740;">
							No ecosystem files were detected in the repository.
						</p>
						<p class="text-caption-xs mt-xs" style="color: var(--text-muted);">
							Create an ecosystem.config.js or pm2.config.js in the repository root to use PM2 start.
						</p>
					</div>
					{/if}
				</div>

				<!-- Select Actions -->
				<div class="flex justify-end gap-sm p-lg pt-0">
					<button
						type="button"
						class="btn-secondary px-4 py-2 text-caption"
						onclick={handleClose}
					>
						Cancel
					</button>
					<button
						type="button"
						class="btn-primary px-4 py-2 text-caption font-semibold"
						style="background: #38CDFF; color: #1a1a2e;"
						onclick={() => { view = 'env'; }}
						disabled={!selectedEcosystemFile}
						title={!selectedEcosystemFile ? 'No ecosystem file selected' : ''}
					>
						Start with PM2
					</button>
				</div>
			{/if}

			<!-- Environment Variables View -->
			{#if view === 'env'}
				<div class="p-lg space-y-md">
					<p class="text-caption" style="color: var(--text-secondary);">
						Add environment variables before starting PM2. This step is optional.
					</p>

					<!-- Mode Toggle -->
					<div class="flex gap-sm">
						<button
							type="button"
							class="flex-1 px-3 py-2 text-caption rounded-lg border"
							style={cn(
								envMode === 'paste' ? 'background: rgba(56, 205, 255, 0.1); border-color: #38CDFF; color: #38CDFF;' : 'background: var(--bg-base); border-color: var(--border-color); color: var(--text-secondary);'
							)}
							onclick={() => envMode = 'paste'}
						>
							Paste Variables
						</button>
						<button
							type="button"
							class="flex-1 px-3 py-2 text-caption rounded-lg border"
							style={cn(
								envMode === 'upload' ? 'background: rgba(56, 205, 255, 0.1); border-color: #38CDFF; color: #38CDFF;' : 'background: var(--bg-base); border-color: var(--border-color); color: var(--text-secondary);'
							)}
							onclick={() => envMode = 'upload'}
						>
							Upload .env File
						</button>
					</div>

					<!-- Paste Mode -->
					{#if envMode === 'paste'}
						<textarea
							bind:value={envText}
							placeholder="DB_HOST=localhost&#10;DB_PORT=5432&#10;API_KEY=secret"
							class="w-full h-48 p-md rounded-lg font-mono text-code resize-y"
							style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
							spellcheck="false"
						></textarea>
					{/if}

					<!-- Upload Mode -->
					{#if envMode === 'upload'}
						<div
							class="p-lg rounded-lg text-center border-2 border-dashed"
							style="border-color: var(--border-color);"
						>
							<input
								type="file"
								accept=".env,.env.*"
								onchange={handleFileUpload}
								class="block w-full text-caption"
								style="color: var(--text-secondary);"
							/>
							{#if envFileCount > 0}
								<p class="text-caption mt-sm" style="color: #00E676;">
									✓ File loaded — variables appear above in paste mode
								</p>
							{/if}
						</div>
					{/if}

					<!-- Log output (if any) -->
					{#if lines.length > 0}
						<div
							class="rounded-lg p-md font-mono text-code max-h-[200px] overflow-y-auto"
							style="background: var(--bg-base); border: 1px solid var(--border-color);"
						>
							{#each lines as log}
								<div
									class="py-2xs"
									style={cn(
										'color: var(--text-secondary);',
										log.isError ? 'color: #FF5252;' : '',
										log.line.includes('Wrote') ? 'color: #00E676; font-weight: 600;' : ''
									)}
								>
									{log.line}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Env Actions -->
				<div class="flex justify-end gap-sm p-lg pt-0">
					<button
						type="button"
						class="btn-secondary px-4 py-2 text-caption"
						onclick={() => { view = 'selecting'; }}
					>
						Back
					</button>
					<button
						type="button"
						class="btn-secondary px-4 py-2 text-caption"
						onclick={async () => { view = 'starting'; await handleStartPM2(); }}
					>
						Skip &amp; Start
					</button>
					<button
						type="button"
						class="btn-primary px-4 py-2 text-caption font-semibold"
						style="background: #38CDFF; color: #1a1a2e;"
						onclick={handleWriteEnv}
						disabled={!envText.trim() && Object.keys(envVars).length === 0}
					>
						Write .env &amp; Start
					</button>
				</div>
			{/if}

			<!-- Starting PM2 View -->
			{#if view === 'starting'}
				<!-- Additional step indicator for PM2 Start -->
				<div class="flex gap-sm px-lg pt-md">
					{#each ['clone', 'install', 'approve', 'build', 'ecosystem'] as step}
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
					<div
						class="flex items-center gap-xs px-sm py-2xs rounded-md text-caption font-medium"
						style={cn(
							'background: var(--bg-base); border: 1px solid var(--border-color);',
							lines.some((l) => l.step === 'pm2-start') ? 'border-color: #38CDFF;' : ''
						)}
					>
						<span
							class="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
							style={cn(
								'background: var(--bg-surface); color: var(--text-muted);',
								stepIcon('pm2-start') === '✓' ? 'background: rgba(0, 230, 118, 0.2); color: #00E676;' : '',
								stepIcon('pm2-start') === '✗' ? 'background: rgba(255, 82, 82, 0.2); color: #FF5252;' : '',
								stepIcon('pm2-start') === '…' ? 'background: rgba(56, 205, 255, 0.2); color: #38CDFF;' : ''
							)}
						>
							{stepIcon('pm2-start')}
						</span>
						<span style="color: var(--text-secondary);">PM2 Start</span>
					</div>
				</div>

				<!-- Log output -->
				<div
					bind:this={logContainer}
					class="rounded-lg m-lg mt-sm p-md font-mono text-code overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin"
					style="background: var(--bg-base); border: 1px solid var(--border-color);"
				>
					{#if lines.length === 0}
						<p class="text-center py-xl" style="color: var(--text-muted);">
							Starting PM2...
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
									log.line.includes('Failed') ? 'color: #FF5252; font-weight: 600;' : '',
									log.line.includes('success') && log.line.includes('Complete') ? 'color: #00E676; font-weight: 600;' : ''
								)}
							>
								{log.line}
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</dialog>
{/if}
