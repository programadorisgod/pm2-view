<script lang="ts">
  import {
    Card,
    Badge,
    StatusIndicator,
    ConfirmDeleteModal,
    FeedbackBanner,
    DeployModal,
    DeployConfigForm,
  } from "$lib/ui/components";
  import { base } from "$app/paths";
  import type { PageData } from "./$types";
  import { goto, invalidateAll } from "$app/navigation";

  let { data }: { data: PageData } = $props();

  let {
    process,
    logs: initialLogs,
    isFavorite: initialIsFavorite,
    deployConfig,
  } = $derived(data);

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Logs' },
    { id: 'env', label: 'Environment' },
    { id: 'sharing', label: 'Sharing' },
    { id: 'config', label: 'Configuration' },
  ] as const;

  let activeTab = $state("overview");
  let feedback = $state<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  let deleteModal = $state({ open: false });
  let restartModal = $state({ open: false });
  let stopModal = $state({ open: false });
  let deployModal = $state({ open: false });
  let isDeploying = $state(false);
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

  type LogEntry = { type: "out" | "err"; data: string; timestamp: Date };

  // JSON (polling/load-more) serializes Date timestamps as ISO strings,
  // while SSR (devalue) preserves them as Date objects. Normalize so
  // timestamp.getTime() always works.
  function toLogEntry(raw: {
    type: "out" | "err";
    data: string;
    timestamp: Date | string;
  }): LogEntry {
    return {
      type: raw.type,
      data: raw.data,
      timestamp:
        raw.timestamp instanceof Date ? raw.timestamp : new Date(raw.timestamp),
    };
  }

  let logs = $state<LogEntry[]>([]);
  let loadedLines = $state(50);
  let loadingMore = $state(false);
  let logPollIntervalMs = 3000;
  let logPollTimer: ReturnType<typeof setInterval> | null = null;
  let errBaseline = $state<number | null>(null);
  let clearingErrLogs = $state(false);

  $effect(() => {
    if (initialLogs && initialLogs.length > 0) {
      logs = initialLogs.map(toLogEntry);
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
        logs = result.logs.map(toLogEntry);
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
        logs = result.logs.map(toLogEntry);
      }
    } catch {
      // Silent fail
    }
  }

  // Derived: split logs by type (repository already sorts chronologically)
  let outLogs = $derived(logs.filter((l) => l.type === "out"));
  let errLogs = $derived(logs.filter((l) => l.type === "err"));
  let newErrLogs = $derived(
    errLogs.filter(
      (l) => errBaseline !== null && l.timestamp.getTime() > errBaseline,
    ),
  );

  function errSeenKey() {
    return `pm2view:err:seen:${process.pm_id}`;
  }

  // Sets the "seen" baseline for errors: the first time the Logs tab is
  // opened, current errors become the baseline; afterwards only errors newer
  // than the baseline are highlighted as new.
  function ensureErrBaseline() {
    if (errBaseline !== null) return;
    try {
      const stored = sessionStorage.getItem(errSeenKey());
      if (stored !== null) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed)) {
          errBaseline = parsed;
          return;
        }
      }
    } catch {
      // Storage unavailable — fall through to fresh baseline
    }
    const maxTs = errLogs.reduce(
      (max, l) => Math.max(max, l.timestamp.getTime()),
      0,
    );
    errBaseline = maxTs;
    try {
      sessionStorage.setItem(errSeenKey(), String(maxTs));
    } catch {
      // Storage unavailable — ignore
    }
  }

  function markErrorsSeen() {
    const maxTs = errLogs.reduce(
      (max, l) => Math.max(max, l.timestamp.getTime()),
      0,
    );
    errBaseline = maxTs;
    try {
      sessionStorage.setItem(errSeenKey(), String(maxTs));
    } catch {
      // Storage unavailable — ignore
    }
  }

  async function clearErrLogs() {
    clearingErrLogs = true;
    try {
      const res = await fetch(
        `${base}/projects/${process.pm_id}/logs?stream=err`,
        { method: "DELETE" },
      );
      const result = await res.json();
      if (res.ok && result.success) {
        logs = logs.filter((l) => l.type !== "err");
        markErrorsSeen();
      } else {
        feedback = {
          type: "error",
          text: result.message || "Failed to clear error logs",
        };
      }
    } catch {
      feedback = { type: "error", text: "Failed to clear error logs" };
    } finally {
      clearingErrLogs = false;
    }
  }

  // Scroll containers
  let outContainer: HTMLDivElement | undefined = $state();
  let errContainer: HTMLDivElement | undefined = $state();

  // Track if user has scrolled up (for showing scroll-to-bottom buttons)
  let outIsScrolledUp = $state(false);
  let errIsScrolledUp = $state(false);

  function checkScrollPosition(container: HTMLDivElement) {
    const isScrolledUp = container.scrollTop + container.clientHeight < container.scrollHeight - 20;
    return isScrolledUp;
  }

  function onOutScroll() {
    if (outContainer) outIsScrolledUp = checkScrollPosition(outContainer);
  }

  function onErrScroll() {
    if (errContainer) errIsScrolledUp = checkScrollPosition(errContainer);
  }

  function autoScrollToBottom() {
    if (outContainer) {
      const shouldScroll = outContainer.scrollTop + outContainer.clientHeight >= outContainer.scrollHeight - 20;
      if (shouldScroll) outContainer.scrollTop = outContainer.scrollHeight;
    }
    if (errContainer) {
      const shouldScroll = errContainer.scrollTop + errContainer.clientHeight >= errContainer.scrollHeight - 20;
      if (shouldScroll) errContainer.scrollTop = errContainer.scrollHeight;
    }
  }

  function forceScrollToBottom() {
    if (outContainer) outContainer.scrollTop = outContainer.scrollHeight;
    if (errContainer) errContainer.scrollTop = errContainer.scrollHeight;
  }

  // Auto-scroll when logs change
  let logsTabFirstRender = $state(true);
  $effect(() => {
    if (activeTab === "logs" && logs.length > 0) {
      requestAnimationFrame(() => {
        if (logsTabFirstRender) {
          forceScrollToBottom();
          logsTabFirstRender = false;
        } else {
          autoScrollToBottom();
        }
      });
    }
    if (activeTab !== "logs") {
      logsTabFirstRender = true;
    }
  });

  interface EnvRow {
    key: string;
    value: string;
  }

  let envRows = $state<EnvRow[]>([]);
  let envVars = $state<Record<string, string>>({});
  let envLoaded = $state(false);
  let envDirty = $state(false);
  let envSaving = $state(false);
  let envLoading = $state(false);
  let envFeedback = $state<{ type: "success" | "error"; text: string } | null>(null);
  let envPath = $state<string | null>(null);
  let envRestarting = $state(false);

  // Load env vars from .env file on mount
  async function loadEnvVars() {
    envLoading = true;
    try {
      const res = await fetch(`${base}/api/projects/${process.pm_id}/env`);
      if (res.ok) {
        const data = await res.json();
        envVars = data.envVars || {};
        envPath = data.envPath;
        envRows = Object.entries(envVars).map(([key, value]) => ({ key, value }));
        envDirty = false;
        envLoaded = true;
      }
    } catch {
      // Non-critical
    } finally {
      envLoading = false;
    }
  }

  // Load when env tab is first activated
  $effect(() => {
    if (activeTab === 'env' && !envLoaded && !envLoading) {
      loadEnvVars();
    }
  });

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

  function requestRestart() {
    restartModal.open = true;
  }

  function requestStop() {
    stopModal.open = true;
  }

  async function confirmDelete(deleteFiles = false) {
    deleteModal.open = false;
    feedback = null;
    try {
      const res = await fetch(`${base}/projects/api?action=delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pm_id: process.pm_id.toString(), deleteFiles }),
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
    ensureErrBaseline();
    logPollTimer = setInterval(pollLogs, logPollIntervalMs);

    return () => {
      if (logPollTimer) clearInterval(logPollTimer);
      logPollTimer = null;
    };
  });

  function addEnvRow() {
    envRows = [...envRows, { key: "", value: "" }];
    envDirty = true;
  }

  async function removeEnvRow(index: number) {
    const removed = envRows[index];
    envRows = envRows.filter((_, i) => i !== index);
    envDirty = true;
    // Immediately save to .env file
    if (removed && removed.key.trim()) {
      await saveEnvVars(false);
    }
  }

  function updateEnvRow(index: number, field: "key" | "value", value: string) {
    envRows = envRows.map((row, i) =>
      i === index ? { ...row, [field]: value } : row,
    );
    envDirty = true;
  }

  async function saveEnvVars(restart = false) {
    const invalid = envRows.find((row) => !row.key.trim());
    if (invalid) {
      envFeedback = { type: "error", text: "Every variable needs a key" };
      return;
    }

    envSaving = true;
    envFeedback = null;
    try {
      const envVarsObj: Record<string, string> = {};
      for (const row of envRows) {
        if (row.key.trim()) {
          envVarsObj[row.key.trim()] = row.value;
        }
      }

      const res = await fetch(`${base}/api/projects/${process.pm_id}/env`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          envVars: envVarsObj,
          restart,
          processName: process.name,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        envDirty = false;
        envPath = result.envPath;
        if (result.restarted) {
          envFeedback = {
            type: "success",
            text: `Environment variables saved and process restarted.`,
          };
          await invalidateAll();
        } else {
          envFeedback = {
            type: "success",
            text: `Environment variables saved. Process is not running, no restart needed.`,
          };
        }
      } else {
        envFeedback = { type: "error", text: result.error || "Failed to save" };
      }
    } catch {
      envFeedback = {
        type: "error",
        text: "Failed to save environment variables",
      };
    } finally {
      envSaving = false;
    }
  }

  async function importFromEnvFile() {
    envLoading = true;
    envFeedback = null;
    try {
      const res = await fetch(`${base}/api/projects/${process.pm_id}/env`);
      if (res.ok) {
        const data = await res.json();
        envVars = data.envVars || {};
        envPath = data.envPath;
        envRows = Object.entries(envVars).map(([key, value]) => ({ key, value }));
        envDirty = false;
        envLoaded = true;
        envFeedback = { type: "success", text: `Loaded ${Object.keys(envVars).length} variables from .env` };
      } else {
        const result = await res.json();
        envFeedback = { type: "error", text: result.error || "Failed to load .env" };
      }
    } catch {
      envFeedback = { type: "error", text: "Failed to load .env file" };
    } finally {
      envLoading = false;
    }
  }
</script>

<div class="w-full">
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
    <div class="mb-md">
      <FeedbackBanner type={feedback.type} message={feedback.text} />
    </div>
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
          class="transition-colors self-center"
          style="font-size: 1.25rem; line-height: 1; color: {isFavorite ? '#FFD740' : 'var(--text-muted)'};"
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
      <button
        class="btn-primary px-3 py-1.5 text-caption inline-flex items-center gap-1.5"
        onclick={() => { deployModal.open = true; }}
        disabled={isDeploying}
        class:opacity-40={isDeploying}
        class:cursor-not-allowed={isDeploying}
        title="Deploy: git pull, install, build, restart"
      >
        {#if isDeploying}
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Deploying...
        {:else}
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m9-13V1a1 1 0 00-1 1v2.582a5.009 5.009 0 00-3.412 1.918m7.422 2.476V4a1 1 0 00-2 0v1.582"/>
          </svg>
          Deploy
        {/if}
      </button>
      {#if process.status === "online"}
        <button
          class="btn-secondary px-3 py-1.5 text-caption"
          onclick={requestRestart}>Restart</button
        >
        <button
          class="btn-secondary px-3 py-1.5 text-caption"
          onclick={requestStop}>Stop</button
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
    {#each TABS as tab}
      <button
        class="px-md py-sm text-caption font-medium transition-colors border-b-2"
        style="border-color: {activeTab === tab.id
          ? '#38CDFF'
          : 'transparent'}; color: {activeTab === tab.id
          ? '#38CDFF'
          : 'var(--text-muted)'};"
        onclick={() => (activeTab = tab.id)}
      >
        {tab.label}
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
              {#if outIsScrolledUp}
                <button
                  class="btn-secondary px-2 py-1 text-xs flex items-center gap-1"
                  onclick={forceScrollToBottom}
                  title="Scroll to bottom"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                  Scroll to bottom
                </button>
              {/if}
            </div>
            {#if outLogs.length === 0}
              <p class="text-center py-xl" style="color: var(--text-muted);">
                No output logs
              </p>
            {:else}
              <div
                bind:this={outContainer}
                onscroll={onOutScroll}
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
              <div class="flex items-center gap-sm">
                {#if newErrLogs.length > 0}
                  <span
                    class="px-2 py-1 text-xs rounded-full font-medium"
                    style="background: rgba(255, 82, 82, 0.15); color: #FF5252;"
                    title="Errors newer than your last view"
                  >
                    +{newErrLogs.length} new
                  </span>
                  <button
                    class="btn-secondary px-2 py-1 text-xs"
                    onclick={markErrorsSeen}
                    title="Mark all visible errors as seen"
                  >
                    Mark seen
                  </button>
                {/if}
                <button
                  class="btn-secondary px-2 py-1 text-xs flex items-center gap-1"
                  onclick={clearErrLogs}
                  disabled={clearingErrLogs}
                  title="Clear error logs (like cls/clear in a terminal)"
                >
                  {clearingErrLogs
                    ? "Clearing..."
                    : "Clear"}
                </button>
                {#if errIsScrolledUp}
                  <button
                    class="btn-secondary px-2 py-1 text-xs flex items-center gap-1"
                    onclick={forceScrollToBottom}
                    title="Scroll to bottom"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                    Scroll to bottom
                  </button>
                {/if}
              </div>
            </div>
            {#if errLogs.length === 0}
              <p class="text-center py-xl" style="color: var(--text-muted);">
                No error logs
              </p>
            {:else}
              <div
                bind:this={errContainer}
                onscroll={onErrScroll}
                class="rounded-lg p-md font-mono text-code overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin"
                style="background: var(--bg-base); border: 1px solid var(--border-color);"
              >
                {#each errLogs as log}
                  {@const isNew = errBaseline !== null && log.timestamp.getTime() > errBaseline}
                  <div
                    class="py-2xs"
                    style="color: #FF5252;{isNew
                      ? ' background: rgba(255, 82, 82, 0.12); border-left: 3px solid #FF5252; padding-left: 4px;'
                      : ''}"
                  >
                    {#if isNew}
                      <span
                        class="inline-block text-[10px] font-bold uppercase mr-1 align-middle"
                        style="color: #FFD740;"
                        >NEW</span
                      >
                    {/if}
                    {log.data}
                  </div>
                {/each}
              </div>
            {/if}
          </Card>
        </div>
      {:else if activeTab === "env"}
        <Card>
          <div class="flex items-center justify-between mb-md">
            <h2
              class="text-h3 font-semibold"
              style="color: var(--text-primary);"
            >
              Environment Variables
            </h2>
            <div class="flex items-center gap-sm">
              <button
                class="btn-secondary px-3 py-1.5 text-body-sm inline-flex items-center gap-1"
                onclick={importFromEnvFile}
                disabled={envLoading}
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                Import from .env
              </button>
              <button
                class="btn-secondary px-3 py-1.5 text-body-sm inline-flex items-center gap-1"
                onclick={addEnvRow}
                disabled={envLoading || !envLoaded}
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                Add Variable
              </button>
              <button
                class="btn-primary px-3 py-1.5 text-body-sm"
                onclick={() => saveEnvVars(true)}
                disabled={envSaving || !envDirty}
              >
                {envSaving ? "Saving & Restarting..." : "Save & Restart"}
              </button>
              <button
                class="btn-secondary px-3 py-1.5 text-body-sm"
                onclick={() => saveEnvVars(false)}
                disabled={envSaving || !envDirty}
              >
                {envSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {#if envPath}
            <p class="text-caption-xs mb-md" style="color: var(--text-muted);">
              File: <code class="font-mono">{envPath}</code>
            </p>
          {/if}

          {#if envFeedback}
            <div class="mb-md">
              <FeedbackBanner
                type={envFeedback.type}
                message={envFeedback.text}
                onDismiss={() => (envFeedback = null)}
              />
            </div>
          {/if}

          {#if envLoading}
            <p class="text-center py-xl" style="color: var(--text-muted);">
              Loading environment variables...
            </p>
          {:else if envRows.length === 0}
            <p class="text-center py-xl" style="color: var(--text-muted);">
              No environment variables found. Click "Import from .env" to load existing variables or "Add Variable" to create new ones.
            </p>
          {:else}
            <div class="space-y-xs">
              {#each envRows as env, i (i)}
                <div
                  class="flex items-center gap-sm py-sm px-md rounded-md"
                  style="background: var(--bg-surface);"
                >
                  <input
                    class="min-w-[160px] w-[220px] font-mono text-body-sm px-2 py-1 rounded border"
                    style="background: var(--bg-base); color: var(--text-primary); border-color: var(--border-color);"
                    value={env.key}
                    placeholder="KEY_NAME"
                    spellcheck="false"
                    oninput={(e) => updateEnvRow(i, "key", e.currentTarget.value)}
                  />
                  <input
                    class="flex-1 min-w-0 font-mono text-body-sm px-2 py-1 rounded border"
                    style="background: var(--bg-base); color: var(--text-primary); border-color: var(--border-color);"
                    value={env.value}
                    placeholder="value"
                    spellcheck="false"
                    oninput={(e) => updateEnvRow(i, "value", e.currentTarget.value)}
                  />
                  <button
                    class="shrink-0 p-1.5 rounded"
                    style="color: #FF5252;"
                    onclick={() => removeEnvRow(i)}
                    title="Remove variable"
                    aria-label="Remove variable"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
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
      {:else if activeTab === "config"}
        <DeployConfigForm
          projectId={data.projectInternalId ?? ''}
          initialConfig={data.deployConfig}
        />
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

<!-- Restart Confirmation Modal -->
{#if restartModal.open}
  <dialog
    open
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background: transparent; border: none;"
    onclose={() => { restartModal.open = false; }}
  >
    <button
      type="button"
      class="fixed inset-0"
      style="background: rgba(0,0,0,0.6); border: none; cursor: pointer;"
      onclick={() => { restartModal.open = false; }}
      aria-label="Close modal"
    ></button>
    <div
      class="relative w-full max-w-md rounded-xl shadow-2xl p-lg"
      style="background: var(--bg-surface); border: 1px solid var(--border-color);"
    >
      <div class="flex items-center gap-md mb-lg">
        <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgba(255, 183, 77, 0.15);">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FFB74D;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </div>
        <div>
          <h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Restart Process</h3>
          <p class="text-caption" style="color: var(--text-muted);">This will cause a brief downtime</p>
        </div>
      </div>
      <p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
        Are you sure you want to restart <strong class="font-mono" style="color: var(--text-primary);">{process.name}</strong>?
      </p>
      <div class="flex gap-sm justify-end">
        <button type="button" class="btn-secondary px-4 py-2 text-body-sm" onclick={() => { restartModal.open = false; }}>Cancel</button>
        <button type="button" class="btn-primary px-4 py-2 text-body-sm" onclick={() => { restartModal.open = false; handleAction("restart"); }}>Restart</button>
      </div>
    </div>
  </dialog>
{/if}

<!-- Stop Confirmation Modal -->
{#if stopModal.open}
  <dialog
    open
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background: transparent; border: none;"
    onclose={() => { stopModal.open = false; }}
  >
    <button
      type="button"
      class="fixed inset-0"
      style="background: rgba(0,0,0,0.6); border: none; cursor: pointer;"
      onclick={() => { stopModal.open = false; }}
      aria-label="Close modal"
    ></button>
    <div
      class="relative w-full max-w-md rounded-xl shadow-2xl p-lg"
      style="background: var(--bg-surface); border: 1px solid var(--border-color);"
    >
      <div class="flex items-center gap-md mb-lg">
        <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgba(255, 82, 82, 0.15);">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5252;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/>
          </svg>
        </div>
        <div>
          <h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Stop Process</h3>
          <p class="text-caption" style="color: var(--text-muted);">The process will be unavailable</p>
        </div>
      </div>
      <p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
        Are you sure you want to stop <strong class="font-mono" style="color: var(--text-primary);">{process.name}</strong>?
      </p>
      <div class="flex gap-sm justify-end">
        <button type="button" class="btn-secondary px-4 py-2 text-body-sm" onclick={() => { stopModal.open = false; }}>Cancel</button>
        <button type="button" class="btn-danger px-4 py-2 text-body-sm" onclick={() => { stopModal.open = false; handleAction("stop"); }}>Stop</button>
      </div>
    </div>
  </dialog>
{/if}

<DeployModal
  open={deployModal.open}
  pmId={process.pm_id.toString()}
  processName={process.name}
  projectId={data.projectInternalId ?? ''}
  onDeploying={(deploying) => { isDeploying = deploying; }}
  onClose={() => { deployModal.open = false; }}
/>
