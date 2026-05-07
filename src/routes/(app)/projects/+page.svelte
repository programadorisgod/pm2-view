<script lang="ts">
  import {
    Card,
    Badge,
    ConfirmDeleteModal,
    FeedbackBanner,
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
  let showFavoritesOnly = $state(false);

  let favoriteProcesses = $derived(processes.filter((p) => p.isFavorite));
  let nonFavoriteProcesses = $derived(processes.filter((p) => !p.isFavorite));
  let displayedNonFavorites = $derived(
    showFavoritesOnly ? [] : nonFavoriteProcesses,
  );
  let totalDisplayed = $derived(
    showFavoritesOnly ? favoriteProcesses : processes,
  );

  function getFavoriteStarStyle(isFavorite: boolean) {
    if (isFavorite) {
      return "color: #FFD740; text-shadow: 0 0 6px rgba(255, 215, 64, 0.65); background: rgba(255, 215, 64, 0.18); border: 1px solid rgba(255, 215, 64, 0.45); border-radius: 999px; padding: 0.1rem 0.4rem;";
    }
    return "color: var(--text-muted); text-shadow: none; background: transparent; border: 1px solid transparent; border-radius: 999px; padding: 0.1rem 0.4rem;";
  }

  function getFavoriteStarLabel(isFavorite: boolean) {
    return isFavorite ? "★" : "☆";
  }

  function getFavoriteStarTitle(isFavorite: boolean) {
    return isFavorite ? "Remove from favorites" : "Add to favorites";
  }

  function getFavoritesToggleStyle(isActive: boolean) {
    if (isActive) {
      return "background: rgba(56, 205, 255, 0.22); color: #7AE3FF; border: 1px solid rgba(56, 205, 255, 0.65); box-shadow: 0 0 10px rgba(56, 205, 255, 0.25);";
    }
    return "background: rgba(12, 22, 32, 0.5); color: var(--text-primary); border: 1px solid rgba(130, 160, 190, 0.45); box-shadow: inset 0 0 0 1px rgba(130, 160, 190, 0.08);";
  }

  function getFavoritesToggleLabel(isActive: boolean) {
    return isActive ? "★ Favorites" : "☆ Favorites";
  }

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

  async function confirmDelete() {
    deleteModal.open = false;
    feedback = null;
    try {
      const res = await fetch(`${base}/projects/api?action=delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pm_id: deleteModal.pm_id }),
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
  <div class="mb-xl">
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

  {#if feedback}
    <FeedbackBanner type={feedback.type} message={feedback.text} />
  {/if}

  <!-- Favorites Filter -->
  {#if processes.length > 0}
    <div class="flex items-center gap-sm mb-lg">
      <button
        class="px-3 py-1.5 text-caption rounded-pill transition-colors"
        style={getFavoritesToggleStyle(showFavoritesOnly)}
        onclick={() => (showFavoritesOnly = !showFavoritesOnly)}
      >
        {getFavoritesToggleLabel(showFavoritesOnly)}
      </button>
      {#if showFavoritesOnly}
        <span class="text-caption" style="color: var(--text-muted);">
          {favoriteProcesses.length} of {processes.length} projects
        </span>
      {/if}
    </div>
  {/if}

  {#if totalDisplayed.length === 0}
    <Card>
      <div class="text-center py-2xl">
        {#if showFavoritesOnly}
          <p
            class="text-h3 font-semibold mb-xs"
            style="color: var(--text-secondary);"
          >
            No Favorites Yet
          </p>
          <p class="text-body-sm" style="color: var(--text-muted);">
            Star projects from the list to find them quickly
          </p>
        {:else}
          <p
            class="text-h3 font-semibold mb-xs"
            style="color: var(--text-secondary);"
          >
            No Processes Found
          </p>
          <p class="text-body-sm" style="color: var(--text-muted);">
            PM2 is not running or no processes have been started
          </p>
        {/if}
      </div>
    </Card>
  {:else}
    {#if favoriteProcesses.length > 0}
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
                    class="text-h3 transition-colors"
                    style={getFavoriteStarStyle(!!process.isFavorite)}
                    onclick={() => toggleFavorite(process.name)}
                    title={getFavoriteStarTitle(!!process.isFavorite)}
                  >
                    {getFavoriteStarLabel(!!process.isFavorite)}
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
    {/if}

    {#if displayedNonFavorites.length > 0}
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
                  class="text-h3 transition-colors"
                  style={getFavoriteStarStyle(!!process.isFavorite)}
                  onclick={() => toggleFavorite(process.name)}
                  title={getFavoriteStarTitle(!!process.isFavorite)}
                >
                  {getFavoriteStarLabel(!!process.isFavorite)}
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
