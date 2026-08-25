<script lang="ts">
  import { base } from '$app/paths';
  import { invalidateAll } from '$app/navigation';
  import { browser } from '$app/environment';

  let {
    open = false,
    onClose,
    users = [],
    teams = [],
  }: {
    open: boolean;
    onClose: () => void;
    users: { id: string; email: string; name: string | null }[];
    teams: { id: string; name: string }[];
  } = $props();

  interface UnregisteredProcess {
    name: string;
    pm_id: number;
    status: string;
    cwd: string;
  }

  interface MemberEntry {
    userId: string;
    role: 'owner' | 'editor' | 'viewer';
    email: string;
  }

  let dialogRef = $state<HTMLDialogElement | undefined>();

  let view = $state<'select' | 'form'>('select');
  let unregisteredProcesses = $state<UnregisteredProcess[]>([]);
  let selectedProcess = $state<UnregisteredProcess | null>(null);
  let loading = $state(false);
  let submitting = $state(false);
  let errorMessage = $state<string | null>(null);

  // Form fields
  let name = $state('');
  let description = $state('');
  let targetPath = $state('');
  let teamId = $state<string | null>(null);
  let members = $state<MemberEntry[]>([]);
  let newMemberUserId = $state('');
  let newMemberRole = $state<'owner' | 'editor' | 'viewer'>('viewer');

  let showWarning = $derived(teamId === null && members.length === 0);

  $effect(() => {
    if (open && browser) {
      resetState();
      fetchUnregistered();
      dialogRef?.showModal();
    } else {
      dialogRef?.close();
    }
  });

  function resetState() {
    view = 'select';
    selectedProcess = null;
    loading = false;
    submitting = false;
    errorMessage = null;
    name = '';
    description = '';
    targetPath = '';
    teamId = null;
    members = [];
    newMemberUserId = '';
    newMemberRole = 'viewer';
  }

  async function fetchUnregistered() {
    loading = true;
    try {
      const res = await fetch(`${base}/api/pm2/unregistered`);
      if (res.ok) {
        unregisteredProcesses = await res.json();
      }
    } catch {
      errorMessage = 'Failed to fetch unregistered processes';
    } finally {
      loading = false;
    }
  }

  function selectProcess(process: UnregisteredProcess) {
    selectedProcess = process;
    name = process.name;
    description = `PM2 process: ${process.name}`;
    targetPath = process.cwd;
    view = 'form';
  }

  function addMember() {
    if (!newMemberUserId) return;
    const user = users.find(u => u.id === newMemberUserId);
    if (!user) return;
    if (members.some(m => m.userId === newMemberUserId)) return;

    members = [...members, {
      userId: newMemberUserId,
      role: newMemberRole,
      email: user.email,
    }];
    newMemberUserId = '';
    newMemberRole = 'viewer';
  }

  function removeMember(userId: string) {
    members = members.filter(m => m.userId !== userId);
  }

  async function handleSubmit() {
    if (!selectedProcess) return;

    submitting = true;
    errorMessage = null;

    try {
      const res = await fetch(`${base}/api/projects/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processName: selectedProcess.name,
          name,
          description,
          targetPath: targetPath || undefined,
          teamId,
          members: members.map(m => ({ userId: m.userId, role: m.role })),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        errorMessage = result.error || 'Registration failed';
        return;
      }

      await invalidateAll();
      onClose();
    } catch {
      errorMessage = 'Failed to register process';
    } finally {
      submitting = false;
    }
  }

  function handleClose() {
    if (!submitting) {
      onClose();
    }
  }

  function getStatusVariant(status: string): 'online' | 'stopped' | 'error' | 'offline' {
    switch (status) {
      case 'online': return 'online';
      case 'stopped': return 'stopped';
      case 'error': return 'error';
      default: return 'offline';
    }
  }

  function goBackToSelect() {
    view = 'select';
    selectedProcess = null;
  }
</script>

{#if browser && open}
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
      disabled={submitting}
    ></button>

    <!-- Modal content -->
    <div
      class="relative w-full max-w-xl max-h-[85vh] overflow-y-auto scrollbar-thin rounded-xl shadow-2xl"
      style="background: var(--bg-surface); border: 1px solid var(--border-color);"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-lg pb-0">
        <div class="flex items-center gap-md">
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style="background: rgba(56, 205, 255, 0.15);"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
          </div>
          <div>
            <h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
              Register PM2 Process
            </h3>
            <p class="text-caption" style="color: var(--text-muted);">
              {view === 'select' ? 'Select a running process' : `Registering: ${selectedProcess?.name ?? ''}`}
            </p>
          </div>
        </div>

        {#if view === 'form' && !submitting}
          <button
            type="button"
            class="btn-secondary px-3 py-1.5 text-caption"
            onclick={goBackToSelect}
          >
            Back
          </button>
        {/if}
      </div>

      {#if loading}
        <div class="p-lg text-center">
          <p style="color: var(--text-muted);">Loading unregistered processes...</p>
        </div>
      {:else if view === 'select'}
        <!-- Process selection -->
        <div class="p-lg">
          {#if unregisteredProcesses.length === 0}
            <div
              class="rounded-lg p-lg text-center"
              style="background: var(--bg-base); border: 1px solid var(--border-color);"
            >
              <p style="color: var(--text-secondary);">All running processes are already registered.</p>
            </div>
          {:else}
            <div class="space-y-sm">
              {#each unregisteredProcesses as process}
                <button
                  type="button"
                  class="w-full text-left p-md rounded-lg transition-colors"
                  style="background: var(--bg-base); border: 1px solid var(--border-color);"
                  onclick={() => selectProcess(process)}
                >
                  <div class="flex items-start justify-between">
                    <div>
                      <p class="text-body-sm font-semibold" style="color: var(--text-primary);">
                        {process.name}
                      </p>
                      <p class="text-caption" style="color: var(--text-muted);">
                        {process.cwd || 'No working directory'}
                      </p>
                    </div>
                    <span
                      class="px-2 py-0.5 rounded-full text-caption font-medium"
                      style="background: {process.status === 'online' ? 'rgba(0, 230, 118, 0.15)' : process.status === 'error' ? 'rgba(255, 82, 82, 0.15)' : 'rgba(128, 128, 128, 0.15)'}; color: {process.status === 'online' ? '#00E676' : process.status === 'error' ? '#FF5252' : '#808080'};"
                    >
                      {process.status}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>

      {:else if view === 'form' && selectedProcess}
        <!-- Registration form -->
        <div class="p-lg space-y-md">
          {#if errorMessage}
            <div
              class="rounded-lg p-md text-body-sm"
              style="background: rgba(255, 82, 82, 0.12); border: 1px solid rgba(255, 82, 82, 0.45); color: #FF5252;"
            >
              {errorMessage}
            </div>
          {/if}

          {#if showWarning}
            <div
              class="rounded-lg p-md"
              style="background: rgba(255, 215, 64, 0.1); border: 1px solid rgba(255, 215, 64, 0.3);"
            >
              <p class="text-caption" style="color: #FFD740;">
                Only you (admin) will see this project. You can share it later from the project's Sharing tab.
              </p>
            </div>
          {/if}

          <!-- Name -->
          <div>
            <label for="name" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">
              Name
            </label>
            <input
              id="name"
              type="text"
              bind:value={name}
              class="w-full px-md py-sm rounded-lg text-body-sm"
              style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
            />
          </div>

          <!-- Description -->
          <div>
            <label for="description" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">
              Description
            </label>
            <input
              id="description"
              type="text"
              bind:value={description}
              class="w-full px-md py-sm rounded-lg text-body-sm"
              style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
            />
          </div>

          <!-- Target Path -->
          <div>
            <label for="targetPath" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">
              Target Path <span class="text-caption" style="color: var(--text-muted);">(optional)</span>
            </label>
            <input
              id="targetPath"
              type="text"
              bind:value={targetPath}
              placeholder="/path/to/project"
              class="w-full px-md py-sm rounded-lg text-body-sm"
              style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
            />
          </div>

          <!-- Team -->
          <div>
            <label for="team" class="block text-caption font-medium mb-xs" style="color: var(--text-secondary);">
              Team <span class="text-caption" style="color: var(--text-muted);">(optional)</span>
            </label>
            <select
              id="team"
              bind:value={teamId}
              class="w-full px-md py-sm rounded-lg text-body-sm"
              style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
            >
              <option value={null}>No team</option>
              {#each teams as team}
                <option value={team.id}>{team.name}</option>
              {/each}
            </select>
          </div>

          <!-- Members -->
          <div>
            <div class="block text-caption font-medium mb-sm" style="color: var(--text-secondary);">
              Members <span class="text-caption" style="color: var(--text-muted);">(optional)</span>
            </div>

            {#if members.length > 0}
              <div class="space-y-xs mb-sm">
                {#each members as member}
                  <div
                    class="flex items-center justify-between p-sm rounded-lg"
                    style="background: var(--bg-base); border: 1px solid var(--border-color);"
                  >
                    <div class="flex items-center gap-sm">
                      <span class="text-body-sm" style="color: var(--text-primary);">{member.email}</span>
                      <span class="px-2 py-0.5 rounded-full text-caption" style="background: rgba(56, 205, 255, 0.15); color: #38CDFF;">
                        {member.role}
                      </span>
                    </div>
                    <button
                      type="button"
                      class="text-caption"
                      style="color: var(--text-muted);"
                      onclick={() => removeMember(member.userId)}
                    >
                      Remove
                    </button>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="flex gap-sm">
              <select
                bind:value={newMemberUserId}
                class="flex-1 px-md py-sm rounded-lg text-body-sm"
                style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
              >
                <option value="">Select user</option>
                {#each users.filter(u => !members.some(m => m.userId === u.id)) as user}
                  <option value={user.id}>{user.email}</option>
                {/each}
              </select>
              <select
                bind:value={newMemberRole}
                class="px-md py-sm rounded-lg text-body-sm"
                style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="owner">Owner</option>
              </select>
              <button
                type="button"
                class="btn-secondary px-3 py-1 text-caption"
                onclick={addMember}
                disabled={!newMemberUserId}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="flex justify-end gap-sm p-lg pt-0">
          <button
            type="button"
            class="btn-secondary px-4 py-2 text-caption"
            onclick={handleClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary px-4 py-2 text-caption font-semibold"
            style="background: #38CDFF; color: #1a1a2e;"
            onclick={handleSubmit}
            disabled={submitting || !name.trim()}
          >
            {#if submitting}
              Registering...
            {:else}
              Register Process
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </dialog>
{/if}
