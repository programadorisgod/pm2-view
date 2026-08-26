<script lang="ts">
  let {
    value = $bindable(''),
    label = '',
    id = '',
    class: className = '',
  }: {
    value: string;
    label?: string;
    id?: string;
    class?: string;
  } = $props();

  let open = $state(false);
  let containerEl: HTMLDivElement | undefined = $state();

  // Parse current value into date components
  function parseValue(v: string): { year: number; month: number; day: number; hour: number; minute: number } {
    if (v) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
      }
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate(), hour: now.getHours(), minute: now.getMinutes() };
  }

  let selected = $state(parseValue(value));
  let viewYear = $state(selected.year);
  let viewMonth = $state(selected.month);

  $effect(() => {
    const parsed = parseValue(value);
    selected = parsed;
    viewYear = parsed.year;
    viewMonth = parsed.month;
  });

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(year: number, month: number): number {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Monday = 0
  }

  let calendarDays = $derived.by(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  });

  function prevMonth() {
    if (viewMonth === 0) { viewMonth = 11; viewYear--; }
    else { viewMonth--; }
  }

  function nextMonth() {
    if (viewMonth === 11) { viewMonth = 0; viewYear++; }
    else { viewMonth++; }
  }

  function selectDay(day: number) {
    selected = { ...selected, year: viewYear, month: viewMonth, day };
    emitValue();
    open = false;
  }

  function setHour(h: number) {
    selected = { ...selected, hour: h };
    emitValue();
  }

  function setMinute(m: number) {
    selected = { ...selected, minute: m };
    emitValue();
  }

  function emitValue() {
    const pad = (n: number) => n.toString().padStart(2, '0');
    value = `${selected.year}-${pad(selected.month + 1)}-${pad(selected.day)}T${pad(selected.hour)}:${pad(selected.minute)}`;
  }

  function isToday(day: number): boolean {
    const now = new Date();
    return day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
  }

  function isSelected(day: number): boolean {
    return day === selected.day && viewMonth === selected.month && viewYear === selected.year;
  }

  function clearDate() {
    value = '';
    open = false;
  }

  // Close on outside click
  function handleClickOutside(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      open = false;
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  });
</script>

<div class="relative flex flex-col gap-1 {className}" bind:this={containerEl}>
  {#if label}
    <label for={id} class="text-sm whitespace-nowrap" style="color: var(--text-muted);">{label}</label>
  {/if}
  <button
    {id}
    type="button"
    class="flex items-center gap-2 px-3 py-2 text-sm rounded-md border text-left w-full min-w-0"
    style="background: var(--bg-base); color: {value ? 'var(--text-primary)' : 'var(--text-muted)'}; border-color: var(--border-color);"
    onclick={() => (open = !open)}
  >
    <svg class="w-4 h-4 shrink-0" style="color: var(--text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
    {value || 'Select date...'}
  </button>

  {#if open}
    <div
      class="absolute z-50 mt-1 rounded-lg shadow-2xl p-3"
      style="background: var(--bg-surface); border: 1px solid var(--border-color); min-width: 280px;"
    >
      <!-- Month nav -->
      <div class="flex items-center justify-between mb-2">
        <button class="p-1 rounded hover:bg-white/5" onclick={prevMonth}>
          <svg class="w-4 h-4" style="color: var(--text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <span class="text-sm font-semibold" style="color: var(--text-primary);">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button class="p-1 rounded hover:bg-white/5" onclick={nextMonth}>
          <svg class="w-4 h-4" style="color: var(--text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <!-- Day names -->
      <div class="grid grid-cols-7 gap-0 mb-1">
        {#each DAY_NAMES as dayName}
          <div class="text-center text-[10px] font-medium py-1" style="color: var(--text-muted);">{dayName}</div>
        {/each}
      </div>

      <!-- Calendar grid -->
      <div class="grid grid-cols-7 gap-0">
        {#each calendarDays as day}
          {#if day === null}
            <div class="py-1"></div>
          {:else}
            <button
              class="text-center text-xs py-1.5 rounded transition-colors {isSelected(day) ? 'font-bold' : ''}"
              style="
                color: {isSelected(day) ? 'var(--bg-base)' : (isToday(day) ? '#38CDFF' : 'var(--text-primary)')};
                background: {isSelected(day) ? '#38CDFF' : (isToday(day) ? 'rgba(56, 205, 255, 0.1)' : 'transparent')};
              "
              onclick={() => selectDay(day)}
            >
              {day}
            </button>
          {/if}
        {/each}
      </div>

      <!-- Time picker -->
      <div class="flex items-center justify-center gap-3 mt-3 pt-3" style="border-top: 1px solid var(--border-color);">
        <select
          class="px-2 py-1 text-sm rounded border"
          style="background: var(--bg-base); color: var(--text-primary); border-color: var(--border-color);"
          value={selected.hour}
          onchange={(e) => setHour(Number(e.currentTarget.value))}
        >
          {#each Array.from({ length: 24 }, (_, i) => i) as h}
            <option value={h}>{h.toString().padStart(2, '0')}</option>
          {/each}
        </select>
        <span class="text-sm font-bold" style="color: var(--text-muted);">:</span>
        <select
          class="px-2 py-1 text-sm rounded border"
          style="background: var(--bg-base); color: var(--text-primary); border-color: var(--border-color);"
          value={selected.minute}
          onchange={(e) => setMinute(Number(e.currentTarget.value))}
        >
          {#each Array.from({ length: 12 }, (_, i) => i * 5) as m}
            <option value={m}>{m.toString().padStart(2, '0')}</option>
          {/each}
        </select>
      </div>

      <!-- Clear -->
      {#if value}
        <button
          class="w-full mt-2 text-xs py-1 rounded"
          style="color: var(--text-muted);"
          onclick={clearDate}
        >
          Clear
        </button>
      {/if}
    </div>
  {/if}
</div>
