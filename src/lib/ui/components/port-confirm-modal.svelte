<script lang="ts">

	let {
		open = false,
		port,
		processName = null,
		onConfirm,
		onCancel,
		loading = false,
		error = null
	}: {
		open: boolean;
		port: number;
		processName: string | null;
		onConfirm: (code: string) => void;
		onCancel: () => void;
		loading?: boolean;
		error?: string | null;
	} = $props();

	let code = $state('');
	let dialogRef = $state<HTMLDialogElement | undefined>();
	let inputRef = $state<HTMLInputElement | undefined>();

	$effect(() => {
		if (open) {
			code = '';
			dialogRef?.showModal();
			setTimeout(() => inputRef?.focus(), 100);
		} else {
			dialogRef?.close();
		}
	});

	let matches = $derived(/^\d{6}$/.test(code));

	function handleClose(e: Event) {
		const target = e.target as HTMLDialogElement;
		if (target.returnValue === 'cancel' || !matches) {
			onCancel();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && matches && !loading) {
			onConfirm(code);
		}
	}
</script>

{#if open}
	{@const id = `modal-${crypto.randomUUID()}`}
	<dialog
		bind:this={dialogRef}
		id={id}
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: transparent; border: none;"
		onclose={handleClose}
	>
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0"
			style="background: rgba(0,0,0,0.6); border: none; cursor: pointer;"
			onclick={() => { if (!loading) onCancel(); }}
			aria-label="Close modal"
		></button>

		<!-- Modal content -->
		<div
			class="relative w-full max-w-md rounded-xl shadow-2xl p-lg"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			<!-- Header -->
			<div class="flex items-center gap-md mb-lg">
				<div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgba(0, 112, 243, 0.15);">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #0070F3;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
					</svg>
				</div>
				<div>
					<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Confirm Port Kill</h3>
					<p class="text-caption" style="color: var(--text-muted);">Check your email for the code</p>
				</div>
			</div>

		<!-- Body -->
		<div class="mb-lg">
			<div class="flex items-center gap-md p-md rounded-lg mb-md" style="background: var(--bg-card); border: 1px solid var(--border-color);">
				<div class="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style="background: rgba(255, 91, 79, 0.1);">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5B4F;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
					</svg>
				</div>
				<div>
					<p class="text-body-sm font-medium" style="color: var(--text-primary);">
						Port <span class="font-mono">{port}</span>
					</p>
					{#if processName}
						<p class="text-caption" style="color: var(--text-muted);">{processName}</p>
					{/if}
				</div>
			</div>

			<p class="text-body-sm mb-sm" style="color: var(--text-secondary);">
				Enter the 6-digit code sent to your email to confirm.
			</p>
		</div>

			<!-- Code input -->
			<input
				type="text"
				inputmode="numeric"
				maxlength="6"
				bind:value={code}
				bind:this={inputRef}
				placeholder="000000"
				class="input-base w-full h-12 px-md text-h2 font-mono text-center tracking-[0.3em] mb-lg"
				onkeydown={handleKeydown}
			/>

			{#if error}
				<div class="flex items-center gap-sm p-sm rounded-md mb-md" style="background: rgba(255, 91, 79, 0.08); border: 1px solid rgba(255, 91, 79, 0.2);">
					<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5B4F;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					<p class="text-caption" style="color: #FF5B4F;">{error}</p>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex gap-sm justify-end">
				<button
					type="button"
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={onCancel}
					disabled={loading}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn-danger px-4 py-2 text-body-sm"
					disabled={!matches || loading}
					class:opacity-40={!matches || loading}
					class:cursor-not-allowed={!matches || loading}
					onclick={() => onConfirm(code)}
				>
					{#if loading}
						<span class="inline-flex items-center gap-1.5">
							<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Killing...
						</span>
					{:else}
						Kill Process
					{/if}
				</button>
			</div>
		</div>
	</dialog>
{/if}
