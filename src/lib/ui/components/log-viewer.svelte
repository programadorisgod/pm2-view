<script lang="ts">
  import { Card } from '$lib/ui/components';
  import DateTimePicker from '$lib/ui/components/date-time-picker.svelte';
  import { base } from '$app/paths';

  let {
    processName,
    pmId,
    initialLogs = [],
  }: {
    processName: string;
    pmId: number;
    initialLogs?: Array<{
      type: 'out' | 'err';
      data: string;
      timestamp: Date | string;
      hasTimestamp?: boolean;
      level: 'info' | 'warn' | 'error';
    }>;
  } = $props();

  type LogEntry = {
    id: string;
    type: 'out' | 'err';
    data: string;
    timestamp: Date;
    hasTimestamp: boolean;
    level: 'info' | 'warn' | 'error';
    dismissed: boolean;
  };

  type RawLog = {
    type: 'out' | 'err';
    data: string;
    timestamp: Date | string;
    hasTimestamp?: boolean;
    level: 'info' | 'warn' | 'error';
  };

  function logIdHash(ts: number, type: string, data: string): string {
    let h = 5381;
    const key = `${ts}:${type}:${data}`;
    for (let i = 0; i < key.length; i++) {
      h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    }
    return `log-${h >>> 0}`;
  }

  // Duplicate log lines (same second, stream and content) produce identical
  // hashes; keyed {#each} requires unique keys, so disambiguate by occurrence.
  function toLogEntries(rawLogs: RawLog[]): LogEntry[] {
    const seen = new Map<string, number>();
    return rawLogs.map((raw) => {
      const ts = raw.timestamp instanceof Date ? raw.timestamp : new Date(raw.timestamp);
      const base = `${ts.getTime()}:${raw.type}:${raw.data}`;
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      const id =
        occurrence === 0
          ? logIdHash(ts.getTime(), raw.type, raw.data)
          : `${logIdHash(ts.getTime(), raw.type, raw.data)}-${occurrence}`;
      return {
        id,
        type: raw.type,
        data: raw.data,
        timestamp: ts,
        hasTimestamp: raw.hasTimestamp ?? ts.getTime() > 0,
        level: raw.level,
        dismissed: false,
      };
    });
  }

  let logs = $state<LogEntry[]>([]);
  let lineCount = $state(100);
  let logPollTimer: ReturnType<typeof setInterval> | null = null;
  let pollInFlight = false;
  const LOG_POLL_INTERVAL = 3000;

  // Sync initial logs from SSR
  let initialSynced = false;
  $effect(() => {
    if (initialLogs && initialLogs.length > 0 && !initialSynced) {
      initialSynced = true;
      logs = toLogEntries(initialLogs);
    }
  });

  // Filter state
  let filterLevel = $state<'all' | 'info' | 'warn' | 'error'>('all');
  let filterStream = $state<'all' | 'out' | 'err'>('all');
  let searchQuery = $state('');
  let dateFrom = $state('');
  let dateTo = $state('');
  let viewMode = $state<'unified' | 'split'>('unified');
  let sortOrder = $state<'newest' | 'oldest'>('oldest');
  let showDismissed = $state(false);

  // New error tracking
  let errBaseline = $state<number | null>(null);

  function errSeenKey() {
    return `pm2view:err:seen:${pmId}`;
  }

  function ensureErrBaseline() {
    if (errBaseline !== null) return;
    const errEntries = logs.filter((l) => l.type === 'err');
    const maxTs = errEntries.length > 0
      ? errEntries.reduce((max, l) => Math.max(max, l.timestamp.getTime()), 0)
      : 0;
    try {
      const stored = sessionStorage.getItem(errSeenKey());
      if (stored !== null) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed) && parsed >= maxTs) {
          errBaseline = parsed;
          return;
        }
      }
    } catch {}
    if (maxTs === 0) return;
    errBaseline = maxTs;
    try {
      sessionStorage.setItem(errSeenKey(), String(maxTs));
    } catch {}
  }

  function markErrorsSeen() {
    const errEntries = logs.filter((l) => l.type === 'err');
    const maxTs = errEntries.reduce((max, l) => Math.max(max, l.timestamp.getTime()), 0);
    errBaseline = maxTs;
    try {
      sessionStorage.setItem(errSeenKey(), String(maxTs));
    } catch {}
  }

  function dismissError(timestamp: number, data: string) {
    for (const log of logs) {
      if (log.timestamp.getTime() === timestamp && log.data === data) {
        log.dismissed = true;
      }
    }
    logs = [...logs];
  }

  function dismissAllErrors() {
    for (const log of logs) {
      if (log.type === 'err') log.dismissed = true;
    }
    logs = [...logs];
    markErrorsSeen();
  }

  let filteredLogs = $derived.by(() => {
    let result = showDismissed ? logs : logs.filter((l) => !l.dismissed);

    if (filterLevel !== 'all') {
      result = result.filter((l) => l.level === filterLevel);
    }
    if (filterStream !== 'all') {
      result = result.filter((l) => l.type === filterStream);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) => l.data.toLowerCase().includes(q));
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) {
        result = result.filter((l) => l.timestamp >= from);
      }
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        result = result.filter((l) => l.timestamp <= to);
      }
    }
    result = sortOrder === 'newest'
      ? [...result].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      : result;
    return result;
  });

  // Counts exclude level filter so tabs always show correct totals
  let logsForCounts = $derived.by(() => {
    let result = showDismissed ? logs : logs.filter((l) => !l.dismissed);
    if (filterStream !== 'all') {
      result = result.filter((l) => l.type === filterStream);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) => l.data.toLowerCase().includes(q));
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) {
        result = result.filter((l) => l.timestamp >= from);
      }
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        result = result.filter((l) => l.timestamp <= to);
      }
    }
    return result;
  });

  let filteredOutLogs = $derived(filteredLogs.filter((l) => l.type === 'out'));
  let filteredErrLogs = $derived(filteredLogs.filter((l) => l.type === 'err'));
  let newErrCount = $derived(
    filteredErrLogs.filter((l) => errBaseline !== null && l.timestamp.getTime() > errBaseline).length,
  );

  let levelCounts = $derived.by(() => {
    const counts = { info: 0, warn: 0, error: 0 };
    for (const l of logsForCounts) {
      counts[l.level]++;
    }
    return counts;
  });

  let dismissedCount = $derived(logs.filter((l) => l.dismissed).length);

  function restoreAllErrors() {
    for (const log of logs) {
      log.dismissed = false;
    }
    logs = [...logs];
  }

  // Fetch logs
  async function fetchLogs(lines: number) {
    try {
      const url = `${base}/projects/${pmId}/logs?lines=${lines}`;
      const res = await fetch(url);
      const text = await res.text();
      let result: { success: boolean; logs: Array<{ type: 'out' | 'err'; data: string; timestamp: Date | string; hasTimestamp?: boolean; level: 'info' | 'warn' | 'error' }> };
      try {
        result = JSON.parse(text);
      } catch {
        console.warn('[LogViewer] Failed to parse response:', text.slice(0, 200));
        return;
      }
      if (!result.success) {
        console.warn('[LogViewer] Fetch returned success=false');
        return;
      }
      const rawLogs = result.logs;
      if (rawLogs.length === logs.length && rawLogs.length > 0) {
        const lastRaw = rawLogs[rawLogs.length - 1];
        const lastTs = lastRaw.timestamp instanceof Date ? lastRaw.timestamp.getTime() : new Date(lastRaw.timestamp).getTime();
        const lastLog = logs[logs.length - 1];
        if (lastTs === lastLog.timestamp.getTime() && lastRaw.data === lastLog.data) return;
      }
      const dismissed = new Set(
        logs.filter((l) => l.dismissed).map((l) => `${l.timestamp.getTime()}:${l.data}`),
      );
      const newLogs = toLogEntries(rawLogs);
      for (const entry of newLogs) {
        if (dismissed.has(`${entry.timestamp.getTime()}:${entry.data}`)) {
          entry.dismissed = true;
        }
      }
      logs = newLogs;
      ensureErrBaseline();
    } catch (e) {
      console.warn('[LogViewer] fetchLogs error:', e);
    }
  }

  async function pollLogs() {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      await fetchLogs(lineCount);
    } finally {
      pollInFlight = false;
    }
  }

  // Polling — stable effect, no reactive deps
  $effect(() => {
    pollLogs();
    logPollTimer = setInterval(pollLogs, LOG_POLL_INTERVAL);
    return () => {
      if (logPollTimer) clearInterval(logPollTimer);
      logPollTimer = null;
    };
  });

  // Scroll containers
  let unifiedContainer: HTMLDivElement | undefined = $state();
  let outContainer: HTMLDivElement | undefined = $state();
  let errContainer: HTMLDivElement | undefined = $state();
  let unifiedScrolledUp = $state(false);
  let outScrolledUp = $state(false);
  let errScrolledUp = $state(false);

  function isScrolledUp(el: HTMLDivElement) {
    return el.scrollTop + el.clientHeight < el.scrollHeight - 20;
  }

  function onUnifiedScroll() {
    if (unifiedContainer) unifiedScrolledUp = isScrolledUp(unifiedContainer);
  }
  function onOutScroll() {
    if (outContainer) outScrolledUp = isScrolledUp(outContainer);
  }
  function onErrScroll() {
    if (errContainer) errScrolledUp = isScrolledUp(errContainer);
  }

  function scrollToBottom(container: HTMLDivElement | undefined) {
    if (container) container.scrollTop = container.scrollHeight;
  }

  // Auto-scroll: check scroll position via rAF only when filteredLogs changes,
  // but debounce to avoid hammering layout on rapid updates
  let lastAutoScrollCheck = 0;
  $effect(() => {
    // Read filteredLogs.length to subscribe, but we only care about increases
    const len = filteredLogs.length;
    const now = performance.now();
    if (len > 0 && now - lastAutoScrollCheck > 100) {
      lastAutoScrollCheck = now;
      requestAnimationFrame(() => {
        const container = viewMode === 'unified' ? unifiedContainer : outContainer;
        if (container) {
          if (sortOrder === 'newest') {
            const atTop = container.scrollTop < 20;
            if (atTop) container.scrollTop = 0;
          } else {
            const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 20;
            if (atBottom) container.scrollTop = container.scrollHeight;
          }
        }
      });
    }
  });

  function clearFilters() {
    filterLevel = 'all';
    filterStream = 'all';
    searchQuery = '';
    dateFrom = '';
    dateTo = '';
  }

  let hasActiveFilters = $derived(
    filterLevel !== 'all' || filterStream !== 'all' || searchQuery.trim() !== '' || dateFrom !== '' || dateTo !== '',
  );

  function formatTimestamp(ts: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`;
  }

  function stripTimestamp(data: string): string {
    return data.replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*:\s*/, '');
  }

  function levelColor(level: 'info' | 'warn' | 'error'): string {
    switch (level) {
      case 'error': return '#FF5B4F';
      case 'warn': return '#FFB74D';
      case 'info': return '#00E676';
    }
  }

  function levelBg(level: 'info' | 'warn' | 'error'): string {
    switch (level) {
      case 'error': return 'rgba(255, 91, 79, 0.12)';
      case 'warn': return 'rgba(255, 183, 77, 0.12)';
      case 'info': return 'transparent';
    }
  }
</script>

<div class="space-y-md">
  <!-- Toolbar -->
  <div class="flex flex-wrap items-center gap-sm">
    <!-- Search -->
    <div class="relative flex-1 min-w-[220px] max-w-md">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style="color: var(--text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <input
        type="text"
        placeholder="Search logs..."
        bind:value={searchQuery}
        class="w-full pl-9 pr-3 py-2 text-sm font-mono rounded-md border"
        style="background: var(--bg-base); color: var(--text-primary); border-color: var(--border-color);"
      />
    </div>

    <!-- Level filter badges -->
    <div class="flex items-center gap-1.5">
      <button
        class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
        style="
          background: {filterLevel === 'all' ? 'var(--bg-surface)' : 'transparent'};
          color: {filterLevel === 'all' ? 'var(--text-primary)' : 'var(--text-muted)'};
          border: 1px solid {filterLevel === 'all' ? 'var(--border-color)' : 'transparent'};
        "
        onclick={() => (filterLevel = 'all')}
      >
        All
      </button>
      {#each (['info', 'warn', 'error'] as const) as level}
        <button
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
          style="
            background: {filterLevel === level ? levelBg(level) : 'transparent'};
            color: {filterLevel === level ? levelColor(level) : 'var(--text-muted)'};
            border: 1px solid {filterLevel === level ? levelColor(level) + '40' : 'transparent'};
          "
          onclick={() => (filterLevel = level)}
        >
          <span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background: {levelColor(level)};"></span>
          {level.toUpperCase()}
          <span class="ml-1.5 opacity-60">{levelCounts[level]}</span>
        </button>
      {/each}
    </div>

    <!-- Stream filter -->
    <select
      bind:value={filterStream}
      class="px-3 py-2 text-sm rounded-md border"
      style="background: var(--bg-base); color: var(--text-primary); border-color: var(--border-color);"
    >
      <option value="all">All streams</option>
      <option value="out">stdout</option>
      <option value="err">stderr</option>
    </select>

    <!-- View mode toggle -->
    <div class="flex rounded-md border overflow-hidden" style="border-color: var(--border-color);">
      <button
        class="px-3 py-1.5 text-sm"
        style="background: {viewMode === 'unified' ? 'var(--bg-surface)' : 'var(--bg-base)'}; color: {viewMode === 'unified' ? 'var(--text-primary)' : 'var(--text-muted)'};"
        onclick={() => (viewMode = 'unified')}
      >
        Unified
      </button>
      <button
        class="px-3 py-1.5 text-sm"
        style="background: {viewMode === 'split' ? 'var(--bg-surface)' : 'var(--bg-base)'}; color: {viewMode === 'split' ? 'var(--text-primary)' : 'var(--text-muted)'};"
        onclick={() => (viewMode = 'split')}
      >
        Split
      </button>
    </div>

    <!-- Sort order toggle -->
    <button
      class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors"
      style="border-color: var(--border-color); background: var(--bg-base); color: var(--text-muted);"
      onclick={() => (sortOrder = sortOrder === 'newest' ? 'oldest' : 'newest')}
      title={sortOrder === 'newest' ? 'Newest first — click to show oldest first' : 'Oldest first — click to show newest first'}
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {#if sortOrder === 'newest'}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14m0 0l-4-4m4 4l4-4"/>
        {:else}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V5m0 0l-4 4m4-4l4 4"/>
        {/if}
      </svg>
      {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
    </button>
  </div>

  <!-- Date range + lines row -->
  <div class="flex flex-wrap items-end gap-sm">
    <div class="flex items-end gap-2">
      <DateTimePicker id="log-date-from" label="From" bind:value={dateFrom} class="w-[180px]" />
      <DateTimePicker id="log-date-to" label="To" bind:value={dateTo} class="w-[180px]" />
      {#if hasActiveFilters}
        <button
          class="text-sm px-3 py-2 rounded-md h-[38px]"
          style="color: #0070F3;"
          onclick={clearFilters}
        >
          Clear
        </button>
      {/if}
    </div>

    <div class="flex-1"></div>

    <div class="flex items-end gap-3">
      <!-- Line count + selector -->
      <div class="flex items-center gap-2 text-sm" style="color: var(--text-muted);">
        <span class="whitespace-nowrap">
          {filteredLogs.length}{hasActiveFilters ? ` / ${logs.length}` : ''} lines
        </span>
        <select
          bind:value={lineCount}
          class="px-2 py-2 text-sm rounded-md border"
          style="background: var(--bg-base); color: var(--text-primary); border-color: var(--border-color);"
        >
          <option value={100}>100</option>
          <option value={200}>200</option>
          <option value={300}>300</option>
          <option value={400}>400</option>
          <option value={500}>500</option>
        </select>
      </div>

      {#if newErrCount > 0}
        <span
          class="px-2.5 py-1 text-sm rounded-full font-medium h-[38px] flex items-center"
          style="background: rgba(255, 91, 79, 0.15); color: #FF5B4F;"
        >
          +{newErrCount} new
        </span>
        <button class="text-sm px-3 py-2 rounded-md h-[38px]" style="color: var(--text-muted);" onclick={markErrorsSeen}>
          Mark seen
        </button>
      {/if}
      <button
        class="btn-secondary px-3 py-2 text-sm h-[38px]"
        onclick={dismissAllErrors}
      >
        Dismiss all
      </button>
      {#if dismissedCount > 0}
        <button
          class="px-3 py-2 text-sm rounded-md font-medium transition-colors h-[38px]"
          style="
            background: {showDismissed ? 'rgba(0, 112, 243, 0.12)' : 'transparent'};
            color: {showDismissed ? '#0070F3' : 'var(--text-muted)'};
            border: 1px solid {showDismissed ? '#0070F340' : 'var(--border-color)'};
          "
          onclick={() => (showDismissed = !showDismissed)}
        >
          {showDismissed ? 'Hide' : 'Show'} dismissed ({dismissedCount})
        </button>
        {#if showDismissed}
          <button
            class="text-sm px-3 py-2 rounded-md h-[38px]"
            style="color: #0070F3;"
            onclick={restoreAllErrors}
          >
            Restore all
          </button>
        {/if}
      {/if}
    </div>
  </div>

  <!-- Log display -->
  {#if viewMode === 'unified'}
    {#if filteredLogs.length === 0}
      <Card>
        <p class="text-center py-xl font-mono text-caption" style="color: var(--text-muted);">
          {hasActiveFilters ? 'No logs match the current filters' : 'No logs available'}
        </p>
      </Card>
    {:else}
      <div class="relative">
        {#if unifiedScrolledUp}
          <button
            class="absolute bottom-3 right-3 z-10 btn-secondary px-3 py-1.5 text-sm flex items-center gap-1.5 shadow-lg"
            onclick={() => scrollToBottom(unifiedContainer)}
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
            Bottom
          </button>
        {/if}
        <div
          bind:this={unifiedContainer}
          onscroll={onUnifiedScroll}
          class="rounded-lg font-mono overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin"
          style="background: var(--bg-base); border: 1px solid var(--border-color); font-size: 13px; line-height: 1.6;"
        >
          {#each filteredLogs as log (log.id)}
            {@const isNewErr = log.type === 'err' && errBaseline !== null && log.timestamp.getTime() > errBaseline}
            <div
              class="flex items-start gap-0 px-4 py-1.5 border-b group"
              style="
                background: {isNewErr ? 'rgba(255, 91, 79, 0.08)' : 'transparent'};
                border-color: var(--border-color);
                {isNewErr ? 'border-left: 3px solid #FF5B4F; padding-left: 13px;' : 'border-left: 3px solid transparent;'}
                {log.dismissed ? 'opacity: 0.4;' : ''}
              "
            >
              {#if isNewErr}
                <span
                  class="shrink-0 text-[10px] font-bold uppercase mr-2 mt-0.5 px-1.5 py-0.5 rounded"
                  style="background: rgba(255, 215, 64, 0.15); color: #FFD740;"
                >
                  NEW
                </span>
              {/if}
              <span
                class="shrink-0 text-xs font-bold uppercase w-14 text-center"
                style="color: {levelColor(log.level)};"
              >
                {log.level}
              </span>
              <span class="shrink-0 text-xs ml-3 whitespace-nowrap font-medium" style="color: var(--text-secondary);">
                {log.hasTimestamp ? formatTimestamp(log.timestamp) : '—'}
              </span>
              <span
                class="shrink-0 text-[11px] uppercase ml-3 font-medium"
                style="color: {log.type === 'err' ? '#FF5B4F80' : '#00E67680'};"
              >
                {log.type}
              </span>
              <span class="flex-1 min-w-0 ml-3 whitespace-pre-wrap break-all" style="color: var(--text-primary);">
                {stripTimestamp(log.data)}
              </span>
              {#if log.type === 'err'}
                {#if log.dismissed && showDismissed}
                  <button
                    class="shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5 rounded"
                    style="color: #0070F3;"
                    onclick={() => { log.dismissed = false; logs = [...logs]; }}
                    title="Restore this error"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                    </svg>
                  </button>
                {:else}
                  <button
                    class="shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5 rounded"
                    style="color: var(--text-muted);"
                    onclick={() => dismissError(log.timestamp.getTime(), log.data)}
                    title="Dismiss this error"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <!-- Split view -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-md">
      <!-- OUT Panel -->
      <Card>
        <div class="flex items-center justify-between mb-md">
          <h3 class="text-h4 font-semibold" style="color: #00E676;">
            <span class="inline-block w-2 h-2 rounded-full mr-2" style="background: #00E676;"></span>
            STDOUT
            <span class="text-xs font-normal ml-1 opacity-60">({filteredOutLogs.length})</span>
          </h3>
          {#if outScrolledUp}
            <button
              class="btn-secondary px-2 py-1 text-xs flex items-center gap-1 shadow-lg"
              onclick={() => scrollToBottom(outContainer)}
              title="Scroll to bottom"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
              Bottom
            </button>
          {/if}
        </div>
        {#if filteredOutLogs.length === 0}
          <p class="text-center py-xl text-caption" style="color: var(--text-muted);">No output</p>
        {:else}
          <div
            bind:this={outContainer}
            onscroll={onOutScroll}
            class="rounded-lg p-md font-mono overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin"
            style="background: var(--bg-base); border: 1px solid var(--border-color); font-size: 13px; line-height: 1.6;"
          >
            {#each filteredOutLogs as log (log.id)}
              <div
                class="py-1"
                style="color: var(--text-primary);"
              >
                <span class="text-xs mr-2 font-medium" style="color: var(--text-secondary);">{log.hasTimestamp ? formatTimestamp(log.timestamp) : '—'}</span>
                {stripTimestamp(log.data)}
              </div>
            {/each}
          </div>
        {/if}
      </Card>

      <!-- ERRORS Panel -->
      <Card>
        <div class="flex items-center justify-between mb-md">
          <h3 class="text-h4 font-semibold" style="color: #FF5B4F;">
            <span class="inline-block w-2 h-2 rounded-full mr-2" style="background: #FF5B4F;"></span>
            STDERR
            <span class="text-xs font-normal ml-1 opacity-60">({filteredErrLogs.length})</span>
          </h3>
          <div class="flex items-center gap-sm">
            {#if newErrCount > 0}
              <span
                class="px-2 py-0.5 text-xs rounded-full font-medium"
                style="background: rgba(255, 91, 79, 0.15); color: #FF5B4F;"
              >
                +{newErrCount} new
              </span>
            {/if}
            {#if errScrolledUp}
              <button class="btn-secondary px-2 py-1 text-xs flex items-center gap-1" onclick={() => scrollToBottom(errContainer)} title="Scroll to bottom">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
                Bottom
              </button>
            {/if}
          </div>
        </div>
        {#if filteredErrLogs.length === 0}
          <p class="text-center py-xl text-caption" style="color: var(--text-muted);">No errors</p>
        {:else}
          <div
            bind:this={errContainer}
            onscroll={onErrScroll}
            class="rounded-lg p-md font-mono overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin"
            style="background: var(--bg-base); border: 1px solid var(--border-color); font-size: 13px; line-height: 1.6;"
          >
            {#each filteredErrLogs as log (log.id)}
              {@const isNew = errBaseline !== null && log.timestamp.getTime() > errBaseline}
              <div
                class="py-1 group flex items-start"
                style="
                  color: {levelColor(log.level)};
                  {isNew ? 'background: rgba(255, 91, 79, 0.12); border-left: 3px solid #FF5B4F; padding-left: 13px;' : 'background: transparent;'}
                  {log.dismissed ? 'opacity: 0.4;' : ''}
                "
              >
                {#if isNew}
                  <span class="shrink-0 text-[10px] font-bold uppercase mr-2 mt-0.5 px-1.5 py-0.5 rounded" style="background: rgba(255, 215, 64, 0.15); color: #FFD740;">NEW</span>
                {/if}
                <span class="text-xs mr-2 font-medium" style="color: var(--text-secondary);">{log.hasTimestamp ? formatTimestamp(log.timestamp) : '—'}</span>
                <span class="flex-1 min-w-0 whitespace-pre-wrap break-all">{stripTimestamp(log.data)}</span>
                {#if log.dismissed && showDismissed}
                  <button
                    class="shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5 rounded"
                    style="color: #0070F3;"
                    onclick={() => { log.dismissed = false; logs = [...logs]; }}
                    title="Restore"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                    </svg>
                  </button>
                {:else}
                  <button
                    class="shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5 rounded"
                    style="color: var(--text-muted);"
                    onclick={() => dismissError(log.timestamp.getTime(), log.data)}
                    title="Dismiss"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </Card>
    </div>
  {/if}
</div>
