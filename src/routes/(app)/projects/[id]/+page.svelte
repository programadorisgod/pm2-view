<script lang="ts">
  import {
    Card,
    Badge,
    StatusIndicator,
    ConfirmDeleteModal,
    FeedbackBanner,
  } from "$lib/ui/components";
  import { base } from "$app/paths";
  import type { PageData } from "./$types";
  import { goto, invalidateAll } from "$app/navigation";

  let { data }: { data: PageData } = $props();

  let {
    process,
    logs: initialLogs,
    envVars: initialEnvVars,
    isFavorite: initialIsFavorite,
  } = $derived(data);

  let activeTab = $state("overview");
  let feedback = $state<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  let deleteModal = $state({ open: false });
  let isFavorite = $state(initialIsFavorite ?? false);

  async function toggleFavorite() {
    try {
      const res = await fetch(`${base}/projects/favorites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pm2Name: process.name }),
      });
      if (res.ok) {
        const result = await res.json();
        isFavorite = result.isFavorite;
      }
    } catch {
      // Silent fail
    }
  }

  let logs = $state<
    Array<{ type: "out" | "err"; data: string; timestamp: Date }>
  >([]);
  let loadedLines = $state(50);
  let loadingMore = $state(false);
  let logPollIntervalMs = 3000;
  let logPollTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (initialLogs && initialLogs.length > 0) {
      logs = initialLogs;
    }
  });

  async function loadMoreLogs() {
    loadingMore = true;
    const newCount = loadedLines + 200;
    try {
      const res = await fetch(
        `${base}/projects/${process.pm_id}/logs?lines=${newCount}`,
      );
      const result = await res.json();
      if (result.success) {
        logs = result.logs;
        loadedLines = newCount;
      }
    } catch {
      // Silent fail
    } finally {
      loadingMore = false;
    }
  }

  async function pollLogs() {
    if (loadingMore) return;
    try {
      const res = await fetch(
        `${base}/projects/${process.pm_id}/logs?lines=${loadedLines}`,
      );
      const result = await res.json();
      if (result.success) {
        logs = result.logs;
      }
    } catch {
      // Silent fail
    }
  }

  // Derived: split logs by type (repository already sorts chronologically)
  let outLogs = $derived(logs.filter((l) => l.type === "out"));
  let errLogs = $derived(logs.filter((l) => l.type === "err"));

  // Scroll containers
  let outContainer: HTMLDivElement | undefined = $state();
  let errContainer: HTMLDivElement | undefined = $state();

  function autoScrollToBottom() {
    if (outContainer) outContainer.scrollTop = outContainer.scrollHeight;
    if (errContainer) errContainer.scrollTop = errContainer.scrollHeight;
  }

  // Auto-scroll when logs change
  $effect(() => {
    if (activeTab === "logs" && logs.length > 0) {
      requestAnimationFrame(() => autoScrollToBottom());
    }
  });

  let envVars = $state<Array<{ key: string; value: string }>>([]);

  $effect(() => {
    if (initialEnvVars && Object.keys(initialEnvVars).length > 0) {
      envVars = Object.entries(initialEnvVars).map(([key, value]) => ({
        key,
        value: value as string,
      }));
    }
  });
  let showSecrets = $state<Record<string, boolean>>({});

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

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  async function handleAction(action: "restart" | "stop" | "start") {
    feedback = null;
    try {
      const res = await fetch(`${base}/projects/api?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pm_id: process.pm_id.toString() }),
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

  function requestDelete() {
    deleteModal.open = true;
  }

  async function confirmDelete() {
    deleteModal.open = false;
    feedback = null;
    try {
      const res = await fetch(`${base}/projects/api?action=delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pm_id: process.pm_id.toString() }),
      });
      const result = await res.json();
      if (res.ok) {
        feedback = {
          type: "success",
          text: result.message || "Delete successful",
        };
        goto(`${base}/projects`);
      } else {
        feedback = { type: "error", text: result.error || "Delete failed" };
      }
    } catch {
      feedback = { type: "error", text: "Failed to delete" };
    }
  }

  // Real-time logs via polling while Logs tab is active
  $effect(() => {
    if (activeTab !== "logs") {
      if (logPollTimer) clearInterval(logPollTimer);
      logPollTimer = null;
      return;
    }

    pollLogs();
    logPollTimer = setInterval(pollLogs, logPollIntervalMs);

    return () => {
      if (logPollTimer) clearInterval(logPollTimer);
      logPollTimer = null;
    };
  });

  function isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      "PASSWORD",
      "SECRET",
      "TOKEN",
      "KEY",
      "API",
      "AUTH",
    ];
    return sensitivePatterns.some((pattern) =>
      key.toUpperCase().includes(pattern),
    );
  }

  function toggleSecret(key: string) {
    showSecrets = { ...showSecrets, [key]: !showSecrets[key] };
  }
</script>

<div class="max-w-5xl mx-auto">
  <!-- Back Button -->
  <div class="mb-lg">
    <a
      href="{base}/projects"
      class="btn-secondary px-3 py-1.5 text-caption inline-flex items-center gap-1.5"
    >
      <svg
        class="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 19l-7-7 7-7"
        /></svg
      >
      Back
    </a>
  </div>

  {#if feedback}
    <FeedbackBanner type={feedback.type} message={feedback.text} />
  {/if}

  <!-- Project Header -->
  <div class="flex items-start justify-between mb-xl">
    <div>
      <div class="flex items-center gap-md mb-sm">
        <h1
          class="text-hero font-bold process-name"
          style="view-transition-name: page-title; color: var(--text-primary);"
        >
          {process.name}
        </h1>
        <Badge variant={getStatusVariant(process.status)}
          >{process.status}</Badge
        >
        <button
          class="text-h3 transition-colors"
          style="color: {isFavorite ? '#FFD740' : 'var(--text-muted)'};"
          onclick={toggleFavorite}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>
      <div
        class="flex items-center gap-md text-caption"
        style="color: var(--text-muted);"
      >
        <span>PM2 ID: {process.pm_id}</span>
        <span>·</span>
        <span>Uptime: {process.uptimeFormatted}</span>
      </div>
    </div>

    <div class="flex gap-xs">
      {#if process.status === "online"}
        <button
          class="btn-secondary px-3 py-1.5 text-caption"
          onclick={() => handleAction("restart")}>Restart</button
        >
        <button
          class="btn-secondary px-3 py-1.5 text-caption"
          onclick={() => handleAction("stop")}>Stop</button
        >
      {:else if process.status === "stopped"}
        <button
          class="btn-success px-3 py-1.5 text-caption"
          onclick={() => handleAction("start")}>Start</button
        >
      {/if}
      <button
        class="btn-danger px-3 py-1.5 text-caption"
        onclick={requestDelete}>Delete</button
      >
    </div>
  </div>

  <!-- Tabs -->
  <div
    class="flex gap-xs mb-lg"
    style="border-bottom: 1px solid var(--border-color);"
  >
    {#each ["overview", "logs", "env", "sharing"] as tab}
      <button
        class="px-md py-sm text-caption font-medium transition-colors border-b-2"
        style="border-color: {activeTab === tab
          ? '#38CDFF'
          : 'transparent'}; color: {activeTab === tab
          ? '#38CDFF'
          : 'var(--text-muted)'};"
        onclick={() => (activeTab = tab)}
      >
        {tab === "env"
          ? "Environment"
          : tab === "sharing"
            ? "Sharing"
            : tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    {/each}
  </div>

  <!-- Tab Content -->
  {#key activeTab}
    <div class="tab-content">
      {#if activeTab === "overview"}
        <!-- Stats -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-md mb-xl">
          <div class="stagger-item" style="--stagger-index: 0;">
            <Card>
              <p
                class="text-caption font-medium mb-1"
                style="color: var(--text-muted);"
              >
                CPU Usage
              </p>
              <p class="text-h1 font-bold" style="color: var(--text-primary);">
                {process.cpu}%
              </p>
            </Card>
          </div>
          <div class="stagger-item" style="--stagger-index: 1;">
            <Card>
              <p
                class="text-caption font-medium mb-1"
                style="color: var(--text-muted);"
              >
                Memory
              </p>
              <p class="text-h1 font-bold" style="color: var(--text-primary);">
                {process.memoryMB} MB
              </p>
            </Card>
          </div>
          <div class="stagger-item" style="--stagger-index: 2;">
            <Card>
              <p
                class="text-caption font-medium mb-1"
                style="color: var(--text-muted);"
              >
                Restarts
              </p>
              <p class="text-h1 font-bold" style="color: var(--text-primary);">
                {process.pm2_env.restart_time}
              </p>
            </Card>
          </div>
        </div>

        <!-- Details -->
        <Card>
          <h2
            class="text-h3 font-semibold mb-md"
            style="color: var(--text-primary);"
          >
            Process Details
          </h2>
          <div class="space-y-xs">
            {#each [["Process Name", process.name], ["PM2 ID", process.pm_id.toString()], ["Status", process.status], ["CPU", process.cpu + "%"], ["Memory", formatBytes(process.monit.memory)], ["Uptime", process.uptimeFormatted], ["Restart Count", process.pm2_env.restart_time.toString()]] as [label, value]}
              <div
                class="flex justify-between py-sm px-md rounded-md"
                style="border-bottom: 1px solid var(--border-color);"
              >
                <span class="text-body-sm" style="color: var(--text-muted);"
                  >{label}</span
                >
                <span
                  class="text-body-sm font-medium"
                  style="color: var(--text-primary);">{value}</span
                >
              </div>
            {/each}
          </div>
        </Card>
      {:else if activeTab === "logs"}
        <div class="flex items-center justify-between mb-md">
          <p class="text-caption" style="color: var(--text-muted);">
            Showing last {loadedLines} lines · Real-time updates active
          </p>
          <button
            class="btn-secondary px-3 py-1.5 text-caption"
            onclick={loadMoreLogs}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-md">
          <!-- OUT Panel -->
          <Card>
            <div class="flex items-center justify-between mb-md">
              <h2 class="text-h3 font-semibold" style="color: #00E676;">
                <span
                  class="inline-block w-2 h-2 rounded-full mr-2"
                  style="background: #00E676;"
                ></span>
                OUT
              </h2>
            </div>
            {#if outLogs.length === 0}
              <p class="text-center py-xl" style="color: var(--text-muted);">
                No output logs
              </p>
            {:else}
              <div
                bind:this={outContainer}
                class="rounded-lg p-md font-mono text-code overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin"
                style="background: var(--bg-base); border: 1px solid var(--border-color);"
              >
                {#each outLogs as log}
                  <div class="py-2xs" style="color: #00E676;">
                    {log.data}
                  </div>
                {/each}
              </div>
            {/if}
          </Card>

          <!-- ERRORS Panel -->
          <Card>
            <div class="flex items-center justify-between mb-md">
              <h2 class="text-h3 font-semibold" style="color: #FF5252;">
                <span
                  class="inline-block w-2 h-2 rounded-full mr-2"
                  style="background: #FF5252;"
                ></span>
                ERRORS
              </h2>
            </div>
            {#if errLogs.length === 0}
              <p class="text-center py-xl" style="color: var(--text-muted);">
                No error logs
              </p>
            {:else}
              <div
                bind:this={errContainer}
                class="rounded-lg p-md font-mono text-code overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin"
                style="background: var(--bg-base); border: 1px solid var(--border-color);"
              >
                {#each errLogs as log}
                  <div class="py-2xs" style="color: #FF5252;">
                    {log.data}
                  </div>
                {/each}
              </div>
            {/if}
          </Card>
        </div>
      {:else if activeTab === "env"}
        <Card>
          <h2
            class="text-h3 font-semibold mb-md"
            style="color: var(--text-primary);"
          >
            Environment Variables
          </h2>

          {#if envVars.length === 0}
            <p class="text-center py-xl" style="color: var(--text-muted);">
              No environment variables configured
            </p>
          {:else}
            <div class="space-y-xs">
              {#each envVars as env (env.key)}
                <div
                  class="flex items-center gap-sm py-sm px-md rounded-md"
                  style="background: var(--bg-surface);"
                >
                  <span
                    class="text-body-sm font-medium min-w-[160px] font-mono"
                    style="color: var(--text-primary);">{env.key}</span
                  >
                  <div class="flex-1 min-w-0 font-mono text-body-sm">
                    {#if isSensitiveKey(env.key)}
                      <span style="color: var(--text-muted); word-break: break-all;">
                        {showSecrets[env.key] ? env.value : "••••••••••••"}
                      </span>
                      <button
                        onclick={() => toggleSecret(env.key)}
                        class="ml-sm text-caption font-medium shrink-0"
                        style="color: #38CDFF;"
                      >
                        {showSecrets[env.key] ? "Hide" : "Show"}
                      </button>
                    {:else}
                      <span style="color: var(--text-secondary); word-break: break-all;">{env.value}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </Card>
      {:else if activeTab === "sharing"}
        <Card>
          <h2
            class="text-h3 font-semibold mb-md"
            style="color: var(--text-primary);"
          >
            Project Sharing
          </h2>
          <p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
            Manage who has access to this project. Invite users or assign the
            project to a team.
          </p>
          <a
            href="{base}/projects/{data?.process?.pm_id}/sharing"
            class="btn-primary px-4 py-2 text-body-sm inline-flex items-center gap-2"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
              />
            </svg>
            Manage Collaborators
          </a>
        </Card>
      {/if}
    </div>
  {/key}
</div>

<ConfirmDeleteModal
  open={deleteModal.open}
  itemName={process.name}
  onConfirm={confirmDelete}
  onCancel={() => {
    deleteModal.open = false;
  }}
/>
