<script lang="ts">
	import { base } from '$app/paths';
	import { cn } from '$lib/motion-core/utils/cn';

	let {
		open = false,
		mode = 'startup',
		onClose
	}: {
		open: boolean;
		mode: 'save' | 'startup';
		onClose: () => void;
	} = $props();

	interface LogLine {
		text: string;
		isError: boolean;
		isCommand?: boolean;
	}

	let dialogRef = $state<HTMLDialogElement | undefined>();
	let logContainer = $state<HTMLDivElement | undefined>();

	let view = $state<'loading' | 'command' | 'password' | 'running' | 'done'>('loading');
	let lines = $state<LogLine[]>([]);
	let startupCommand = $state('');
	let password = $state('');
	let success = $state<boolean | null>(null);
	let copied = $state(false);
	let showPassword = $state(false);
	let doneMessage = $state('Operation completed');

	let title = $derived(mode === 'save' ? 'PM2 Save' : 'PM2 Startup');

	let statusText = $derived.by(() => {
		if (view === 'loading') {
			return mode === 'save' ? 'Saving current process list...' : 'Detecting init system...';
		}
		if (view === 'command') return 'Copy the command or apply it here';
		if (view === 'password') return 'Enter the sudo password to apply it';
		if (view === 'running') return 'Running startup script...';
		if (view === 'done') {
			return success ? doneMessage : 'Operation failed';
		}
		return '';
	});

	$effect(() => {
		if (open) {
			lines = [];
			password = '';
			success = null;
			copied = false;
			showPassword = false;
			doneMessage = 'Operation completed';
			view = 'loading';
			dialogRef?.showModal();
			if (mode === 'save') {
				runSave();
			} else {
				runStartup();
			}
		} else {
			dialogRef?.close();
		}
	});

	// Auto-scroll while receiving new lines
	$effect(() => {
		if (logContainer && view === 'running') {
			requestAnimationFrame(() => {
				if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
			});
		}
	});

	async function runSave() {
		try {
			const res = await fetch(`${base}/api/pm2/system?action=save`, { method: 'POST' });
			const result = await res.json();
			appendOutput(result.output);
			success = res.ok && result.success;
			doneMessage = success ? 'Process list saved' : 'Process list could not be saved';
		} catch (err) {
			appendOutput(err instanceof Error ? err.message : 'Save failed', true);
			success = false;
			doneMessage = 'Process list could not be saved';
		} finally {
			view = 'done';
		}
	}

	async function runStartup() {
		try {
			const res = await fetch(`${base}/api/pm2/system?action=startup`, { method: 'POST' });
			const result = await res.json();
			appendOutput(result.output);

			if (res.ok && result.success && result.command) {
				startupCommand = result.command;
				view = 'command';
			} else if (res.ok && result.success) {
				success = true;
				doneMessage = 'Startup is already configured';
				view = 'done';
			} else {
				success = false;
				doneMessage = 'Failed to detect the init system';
				view = 'done';
			}
		} catch (err) {
			appendOutput(err instanceof Error ? err.message : 'Failed to detect init system', true);
			success = false;
			doneMessage = 'Failed to detect the init system';
			view = 'done';
		}
	}

	function appendOutput(output: string, isError = false) {
		if (!output) return;
		const next = output
			.split('\n')
			.filter((l) => l.trim())
			.map((text) => ({ text, isError }));
		lines = [...lines, ...next];
	}

	async function applyStartup() {
		view = 'running';
		// Show only the apply output, starting with the command being executed,
		// so the sudo/pm2 streaming lines are not lost among the detection log.
		lines = [{ text: `$ ${startupCommand}`, isError: false, isCommand: true }];

		try {
			const res = await fetch(`${base}/api/pm2/system?action=apply-startup`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ command: startupCommand, password })
			});

			if (!res.ok) {
				const error = await res.json();
				lines = [
					...lines,
					{ text: error.error || 'Failed to start', isError: true }
				];
				success = false;
				view = 'done';
				return;
			}

			const reader = res.body?.getReader();
			if (!reader) {
				lines = [...lines, { text: 'Streaming not supported', isError: true }];
				success = false;
				view = 'done';
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';

			const handleRecord = (data: LogLine & { isComplete?: boolean; success?: boolean }) => {
				lines = [...lines, { text: data.text, isError: data.isError }];
				if (data.isComplete) {
					success = data.success ?? false;
					doneMessage = success ? 'Startup script applied' : 'Failed to apply the startup script';
					view = 'done';
				}
			};

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
						handleRecord(JSON.parse(rawLine));
					} catch {
						// Ignore parse errors
					}
				}
			}

			// Flush any trailing record that arrived without a newline
			if (buffer.trim()) {
				try {
					handleRecord(JSON.parse(buffer));
				} catch {
					// Ignore parse errors
				}
			}
		} catch (err) {
			lines = [
				...lines,
				{
					text: err instanceof Error ? err.message : 'Connection lost',
					isError: true
				}
			];
			success = false;
			view = 'done';
		}
	}

	async function copyCommand() {
		try {
			await navigator.clipboard.writeText(startupCommand);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard unavailable — user can select the text manually
		}
	}

	function handleClose() {
		onClose();
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
						style="background: {success === true ? 'rgba(0, 230, 118, 0.15)' : success === false ? 'rgba(255, 82, 82, 0.15)' : 'rgba(56, 205, 255, 0.15)'};"
					>
						{#if view === 'loading' || view === 'running'}
							<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
							</svg>
						{:else if success === true}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #00E676;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
						{:else if success === false}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5252;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						{:else}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
							</svg>
						{/if}
					</div>
					<div>
						<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">{title}</h3>
						<p class="text-caption" style="color: var(--text-muted);">{statusText}</p>
					</div>
				</div>

				{#if view === 'done'}
					<button
						type="button"
						class="btn-secondary px-3 py-1.5 text-caption"
						onclick={handleClose}
					>
						Close
					</button>
				{/if}
			</div>

			<!-- Generated command step -->
			{#if view === 'command'}
				<div class="p-lg">
					<p class="text-body-sm mb-sm" style="color: var(--text-secondary);">
						PM2 detected the init system. To enable startup on boot, run the
						following command:
					</p>

					<div
						class="rounded-lg p-md font-mono text-code overflow-x-auto scrollbar-thin mb-md"
						style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
					>
						{startupCommand}
					</div>

					<div class="flex gap-sm flex-wrap justify-end">
						<button
							type="button"
							class="btn-secondary px-4 py-2 text-body-sm"
							onclick={copyCommand}
						>
							{copied ? 'Copied ✓' : 'Copy command'}
						</button>
						<button
							type="button"
							class="btn-primary px-4 py-2 text-body-sm"
							onclick={() => (view = 'password')}
						>
							Apply here
						</button>
					</div>
				</div>

			<!-- Sudo password step -->
			{:else if view === 'password'}
				<div class="p-lg">
					<p class="text-body-sm mb-sm" style="color: var(--text-secondary);">
						This command requires sudo privileges. Enter your password to apply
						the startup script:
					</p>

					<div class="relative mb-md">
						<input
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							placeholder="sudo password"
							class="input-base w-full h-10 px-md pr-10 text-body-sm font-mono"
							autocomplete="current-password"
							onkeydown={(e) => {
								if (e.key === 'Enter' && password.trim()) applyStartup();
							}}
						/>
						<button
							type="button"
							class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded"
							style="color: var(--text-muted);"
							onclick={() => (showPassword = !showPassword)}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{#if showPassword}
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
								</svg>
							{:else}
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
								</svg>
							{/if}
						</button>
					</div>

					<div class="flex gap-sm flex-wrap justify-end">
						<button
							type="button"
							class="btn-secondary px-4 py-2 text-body-sm"
							onclick={() => (view = 'command')}
						>
							Back
						</button>
						<button
							type="button"
							class="btn-primary px-4 py-2 text-body-sm"
							disabled={!password.trim()}
							class:opacity-40={!password.trim()}
							class:cursor-not-allowed={!password.trim()}
							onclick={applyStartup}
						>
							Apply & Run
						</button>
					</div>
				</div>

			<!-- Loading / running / done: log output -->
			{:else}
				<div
					bind:this={logContainer}
					class="rounded-lg m-lg mt-sm p-md font-mono text-code overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin"
					style="background: var(--bg-base); border: 1px solid var(--border-color);"
				>
					{#if lines.length === 0}
						<p class="text-center py-xl" style="color: var(--text-muted);">
							{view === 'running' ? 'Running command...' : 'Executing...'}
						</p>
					{:else}
						{#each lines as log (log.text + log.isError)}
							<div
								class="py-2xs whitespace-pre-wrap"
								style={cn(
									'color: var(--text-secondary);',
									log.isCommand ? 'color: var(--text-muted); font-style: italic;' : '',
									log.isError ? 'color: #FF5252;' : '',
									log.text.includes('Successfully') ? 'color: #00E676; font-weight: 600;' : '',
									log.text.includes('Command successfully executed') ? 'color: #00E676; font-weight: 600;' : '',
									log.text.includes('Failed') ? 'color: #FF5252; font-weight: 600;' : '',
									log.text.includes('error') ? 'color: #FF5252; font-weight: 600;' : ''
								)}
							>
								{log.text}
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</dialog>
{/if}
