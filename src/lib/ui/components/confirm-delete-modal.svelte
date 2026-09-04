<script lang="ts">

	let {
		open = false,
		itemName,
		processCount = 1,
		onConfirm,
		onCancel,
		loading = false
	}: {
		open: boolean;
		itemName: string;
		processCount?: number;
		onConfirm: (deleteFiles: boolean) => void;
		onCancel: () => void;
		loading?: boolean;
	} = $props();

	let input = $state('');
	let deleteFiles = $state(false);
	let dialogRef = $state<HTMLDialogElement | undefined>();
	let inputRef = $state<HTMLInputElement | undefined>();

	$effect(() => {
		if (open) {
			input = '';
			deleteFiles = false;
			dialogRef?.showModal();
			inputRef?.focus();
		} else {
			dialogRef?.close();
		}
	});

	let matches = $derived(input.trim() === itemName);

	function handleClose(e: Event) {
		const target = e.target as HTMLDialogElement;
		if (target.returnValue === 'cancel' || !matches) {
			onCancel();
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
			onclick={() => { if (!matches) onCancel(); }}
			aria-label="Close modal"
		></button>

		<!-- Modal content -->
		<div
			class="relative w-full max-w-md rounded-xl shadow-2xl p-lg"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			<!-- Header -->
			<div class="flex items-center gap-md mb-lg">
				<div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgba(255, 91, 79, 0.15);">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5B4F;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
					</svg>
				</div>
				<div>
					<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Delete Project</h3>
					<p class="text-caption" style="color: var(--text-muted);">This action cannot be undone</p>
				</div>
			</div>

		<!-- Body -->
		<p class="text-body-sm mb-md" style="color: var(--text-secondary);">
			Please type <strong class="font-mono" style="color: var(--text-primary);">{itemName}</strong> to confirm deletion.
			{#if processCount > 1}
				<br><span class="text-caption" style="color: #FF5B4F;">This will delete {processCount} processes in the group.</span>
			{/if}
		</p>

			<input
				type="text"
				bind:value={input}
				bind:this={inputRef}
				placeholder="Type project name here..."
				class="input-base w-full h-10 px-md text-body-sm font-mono mb-lg"
				onkeydown={(e) => { if (e.key === 'Escape' && !matches) onCancel(); }}
			/>

			<!-- Delete files option -->
			<label class="flex items-start gap-sm p-sm rounded-lg cursor-pointer mb-lg" style="background: rgba(255, 91, 79, 0.05); border: 1px solid rgba(255, 91, 79, 0.2);">
				<input
					type="checkbox"
					bind:checked={deleteFiles}
					class="w-4 h-4 mt-0.5"
				/>
				<div>
					<p class="text-body-sm font-medium" style="color: var(--text-primary);">
						Delete project files from disk
					</p>
					<p class="text-caption-xs" style="color: var(--text-muted);">
						Removes the cloned repository folder and all its contents. This cannot be undone.
					</p>
				</div>
			</label>

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
					onclick={() => onConfirm(deleteFiles)}
				>
					{#if loading}
						<span class="inline-flex items-center gap-1.5">
							<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Deleting...
						</span>
					{:else}
						Delete
					{/if}
				</button>
			</div>
		</div>
	</dialog>
{/if}
