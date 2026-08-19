<script lang="ts">
  import {
    Card,
    Badge,
    ConfirmDeleteModal,
    FeedbackBanner,
    PM2SystemModal,
  } from "$lib/ui/components";
  import { base } from "$app/paths";
  import type { PageData } from "./$types";
  import type { VisibleProject } from "$lib/services/project-listing.service";
  import { invalidateAll } from "$app/navigation";

  let { data }: { data: PageData } = $props();

  let processes = $derived(data.processes ?? ([] as VisibleProject[]));
  let feedback = $state<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  let deleteModal = $state<{ open: boolean; name: string; pm_id: string }>({
    open: false,
    name: "",
    pm_id: "",
  });
  let favoritesExpanded = $state(true);
  let othersExpanded = $state(true);
  let systemModal = $state<{ open: boolean; mode: "save" | "startup" }>({
    open: false,
    mode: "startup",
  });

  let favoriteProcesses = $derived(processes.filter((p) => p.isFavorite));
  let nonFavoriteProcesses = $derived(processes.filter((p) => !p.isFavorite));
  let displayedNonFavorites = $derived(nonFavoriteProcesses);

  function getStatusVariant(status: string) {
    switch (status) {
      case "online":
        return "online";
      case "stopped":
        return "stopped";
      case "error":
        return "error";
      default:
        return "offline";
    }
  }

  async function handleAction(pm_id: string, action: "restart" | "stop") {
    feedback = null;
    try {
      const res = await fetch(`${base}/projects/api?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pm_id }),
      });
      const result = await res.json();
      if (res.ok) {
        feedback = {
          type: "success",
          text: result.message || `${action} successful`,
        };
        await invalidateAll();
      } else {
        feedback = { type: "error", text: result.error || `${action} failed` };
      }
    } catch {
      feedback = { type: "error", text: `Failed to ${action}` };
    }
  }

  async function toggleFavorite(pm2Name: string) {
    try {
      const res = await fetch(`${base}/projects/favorites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pm2Name }),
      });
      if (res.ok) {
        await invalidateAll();
      }
    } catch {
      // Silent fail
    }
  }

  function requestDelete(pm_id: string, name: string) {
    deleteModal = { open: true, name, pm_id };
  }

  async function confirmDelete(deleteFiles = false) {
    deleteModal.open = false;
    feedback = null;
    try {
      const res = await fetch(`${base}/projects/api?action=delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pm_id: deleteModal.pm_id, deleteFiles }),
      });
      const result = await res.json();
      if (res.ok) {
        feedback = {
          type: "success",
          text: result.message || "Delete successful",
        };
        await invalidateAll();
      } else {
        feedback = { type: "error", text: result.error || "Delete failed" };
      }
    } catch {
      feedback = { type: "error", text: "Failed to delete" };
    }
  }
</script>

<div class="max-w-6xl mx-auto">
  <!-- Header -->
  <div class="mb-xl flex items-start justify-between gap-md flex-wrap">
    <div>
      <h1
        class="text-hero font-bold mb-xs"
        style="view-transition-name: page-title; color: var(--text-primary);"
      >
        Projects
      </h1>
      <p class="text-body-sm" style="color: var(--text-secondary);">
        Manage and monitor all your PM2 processes
      </p>
    </div>

    {#if data.userRole === "admin"}
      <div class="flex gap-xs">
        <button
          class="btn-secondary px-3 py-1.5 text-body-sm inline-flex items-center gap-1.5"
          onclick={() => (systemModal = { open: true, mode: "save" })}
          title="Save the current process list (pm2 save)"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
          </svg>
          PM2 Save
        </button>
        <button
          class="btn-secondary px-3 py-1.5 text-body-sm inline-flex items-center gap-1.5"
          onclick={() => (systemModal = { open: true, mode: "startup" })}
          title="Enable PM2 to start processes on boot (pm2 startup)"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          PM2 Startup
        </button>
      </div>
    {/if}
  </div>

  {#if feedback}
    <FeedbackBanner type={feedback.type} message={feedback.text} />
  {/if}

  <!-- Favorites collapsible header -->
  {#if processes.length > 0 && favoriteProcesses.length > 0}
    <div class="mb-lg">
      <button
        class="flex items-center gap-sm px-3 py-2 rounded-lg transition-colors w-fit"
        style="background: var(--bg-surface); border: 1px solid var(--border-color);"
        onclick={() => { favoritesExpanded = !favoritesExpanded; }}
      >
        <svg
          class="w-4 h-4 transition-transform"
          style="color: #FFD740; transform: {favoritesExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
        <span class="text-body-sm font-semibold" style="color: #FFD740;">
          ★ Favorites ({favoriteProcesses.length})
        </span>
      </button>
    </div>
  {/if}

  {#if processes.length > 0 && favoriteProcesses.length === 0 && displayedNonFavorites.length > 0}
    <div class="mb-lg">
      <button
        class="flex items-center gap-sm px-3 py-2 rounded-lg transition-colors w-fit"
        style="background: var(--bg-surface); border: 1px solid var(--border-color);"
        onclick={() => { othersExpanded = !othersExpanded; }}
      >
        <svg
          class="w-4 h-4 transition-transform"
          style="color: var(--text-secondary); transform: {othersExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
        <span class="text-body-sm font-semibold" style="color: var(--text-secondary);">
          Others ({displayedNonFavorites.length})
        </span>
      </button>
    </div>
  {/if}

  {#if processes.length === 0}
    <Card>
      <div class="text-center py-2xl">
        <p
          class="text-h3 font-semibold mb-xs"
          style="color: var(--text-secondary);"
        >
          No Processes Found
        </p>
        <p class="text-body-sm" style="color: var(--text-muted);">
          PM2 is not running or no processes have been started
        </p>
      </div>
    </Card>
  {:else}
    {#if favoriteProcesses.length > 0 && favoritesExpanded}
      <div class="mb-lg">
        <h2
          class="text-body-sm font-semibold mb-sm"
          style="color: var(--text-secondary);"
        >
          Favorites
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {#each favoriteProcesses as process, i (process.pm_id)}
            <div class="stagger-item" style="--stagger-index: {i};">
              <Card class="group">
                <!-- Header -->
                <div class="flex items-start justify-between mb-md">
                  <div>
                    <h3
                      class="text-body-sm font-semibold mb-xs"
                      style="color: var(--text-primary);"
                    >
                      {process.name}
                    </h3>
                    <Badge variant={getStatusVariant(process.status)}>
                      {process.status}
                    </Badge>
                  </div>
                  <button
                    class="transition-colors"
                    style={process.isFavorite
                      ? "color: #FFD740; text-shadow: 0 0 6px rgba(255, 215, 64, 0.65); background: rgba(255, 215, 64, 0.18); border: 1px solid rgba(255, 215, 64, 0.45); border-radius: 999px; padding: 0.1rem 0.4rem;"
                      : "color: var(--text-muted); background: transparent; border: 1px solid transparent; border-radius: 999px; padding: 0.1rem 0.4rem;"}
                    onclick={() => toggleFavorite(process.name)}
                    title={process.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    {process.isFavorite ? "★" : "☆"}
                  </button>
                </div>

                <!-- Stats -->
                <div class="space-y-xs mb-lg">
                  <div class="flex justify-between text-caption">
                    <span style="color: var(--text-muted);">CPU</span>
                    <span
                      class="font-medium"
                      style="color: var(--text-primary);">{process.cpu}%</span
                    >
                  </div>
                  <div class="flex justify-between text-caption">
                    <span style="color: var(--text-muted);">RAM</span>
                    <span
                      class="font-medium"
                      style="color: var(--text-primary);"
                      >{process.memoryMB} MB</span
                    >
                  </div>
                  <div class="flex justify-between text-caption">
                    <span style="color: var(--text-muted);">Uptime</span>
                    <span
                      class="font-medium"
                      style="color: var(--text-primary);"
                      >{process.uptimeFormatted}</span
                    >
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex gap-xs flex-wrap">
                  <a
                    href="{base}/projects/{process.pm_id}"
                    class="btn-secondary px-3 py-1 text-caption flex-1 text-center"
                  >
                    Details
                  </a>

                  {#if process.status === "online"}
                    <button
                      class="btn-secondary px-3 py-1 text-caption"
                      onclick={() =>
                        handleAction(process.pm_id.toString(), "restart")}
                    >
                      Restart
                    </button>
                    <button
                      class="btn-secondary px-3 py-1 text-caption"
                      onclick={() =>
                        handleAction(process.pm_id.toString(), "stop")}
                    >
                      Stop
                    </button>
                  {:else if process.status === "stopped"}
                    <button
                      class="btn-secondary px-3 py-1 text-caption"
                      onclick={() =>
                        handleAction(process.pm_id.toString(), "restart")}
                    >
                      Start
                    </button>
                  {/if}

                  <button
                    class="btn-danger px-3 py-1 text-caption"
                    onclick={() =>
                      requestDelete(process.pm_id.toString(), process.name)}
                  >
                    Delete
                  </button>
                </div>
              </Card>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if favoriteProcesses.length > 0 && displayedNonFavorites.length > 0}
      <div
        class="my-lg"
        style="border-top: 1px solid var(--border-color);"
      ></div>

      <!-- Others collapsible header -->
      <div class="mb-md">
        <button
          class="flex items-center gap-sm px-3 py-2 rounded-lg transition-colors w-fit"
          style="background: var(--bg-surface); border: 1px solid var(--border-color);"
          onclick={() => { othersExpanded = !othersExpanded; }}
        >
          <svg
            class="w-4 h-4 transition-transform"
            style="color: var(--text-secondary); transform: {othersExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          <span class="text-body-sm font-semibold" style="color: var(--text-secondary);">
            Others ({displayedNonFavorites.length})
          </span>
        </button>
      </div>
    {/if}

    {#if displayedNonFavorites.length > 0 && othersExpanded}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
        {#each displayedNonFavorites as process, i (process.pm_id)}
          <div class="stagger-item" style="--stagger-index: {i};">
            <Card class="group">
              <!-- Header -->
              <div class="flex items-start justify-between mb-md">
                <div>
                  <h3
                    class="text-body-sm font-semibold mb-xs"
                    style="color: var(--text-primary);"
                  >
                    {process.name}
                  </h3>
                  <Badge variant={getStatusVariant(process.status)}>
                    {process.status}
                  </Badge>
                </div>
                <button
                  class="transition-colors"
                  style={process.isFavorite
                    ? "color: #FFD740; text-shadow: 0 0 6px rgba(255, 215, 64, 0.65); background: rgba(255, 215, 64, 0.18); border: 1px solid rgba(255, 215, 64, 0.45); border-radius: 999px; padding: 0.1rem 0.4rem;"
                    : "color: var(--text-muted); background: transparent; border: 1px solid transparent; border-radius: 999px; padding: 0.1rem 0.4rem;"}
                  onclick={() => toggleFavorite(process.name)}
                  title={process.isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  {process.isFavorite ? "★" : "☆"}
                </button>
              </div>

              <!-- Stats -->
              <div class="space-y-xs mb-lg">
                <div class="flex justify-between text-caption">
                  <span style="color: var(--text-muted);">CPU</span>
                  <span class="font-medium" style="color: var(--text-primary);"
                    >{process.cpu}%</span
                  >
                </div>
                <div class="flex justify-between text-caption">
                  <span style="color: var(--text-muted);">RAM</span>
                  <span class="font-medium" style="color: var(--text-primary);"
                    >{process.memoryMB} MB</span
                  >
                </div>
                <div class="flex justify-between text-caption">
                  <span style="color: var(--text-muted);">Uptime</span>
                  <span class="font-medium" style="color: var(--text-primary);"
                    >{process.uptimeFormatted}</span
                  >
                </div>
              </div>

              <!-- Actions -->
              <div class="flex gap-xs flex-wrap">
                <a
                  href="{base}/projects/{process.pm_id}"
                  class="btn-secondary px-3 py-1 text-caption flex-1 text-center"
                >
                  Details
                </a>

                {#if process.status === "online"}
                  <button
                    class="btn-secondary px-3 py-1 text-caption"
                    onclick={() =>
                      handleAction(process.pm_id.toString(), "restart")}
                  >
                    Restart
                  </button>
                  <button
                    class="btn-secondary px-3 py-1 text-caption"
                    onclick={() =>
                      handleAction(process.pm_id.toString(), "stop")}
                  >
                    Stop
                  </button>
                {:else if process.status === "stopped"}
                  <button
                    class="btn-secondary px-3 py-1 text-caption"
                    onclick={() =>
                      handleAction(process.pm_id.toString(), "restart")}
                  >
                    Start
                  </button>
                {/if}

                <button
                  class="btn-danger px-3 py-1 text-caption"
                  onclick={() =>
                    requestDelete(process.pm_id.toString(), process.name)}
                >
                  Delete
                </button>
              </div>
            </Card>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<ConfirmDeleteModal
  open={deleteModal.open}
  itemName={deleteModal.name}
  onConfirm={confirmDelete}
  onCancel={() => {
    deleteModal.open = false;
  }}
/>

<PM2SystemModal
  open={systemModal.open}
  mode={systemModal.mode}
  onClose={() => {
    systemModal.open = false;
  }}
/>
