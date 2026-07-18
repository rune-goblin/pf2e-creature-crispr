<script lang="ts">
  import { tick } from 'svelte';
  import type { IwrTypeGroup } from '@/creature-builder/logic/iwrTypes';

  let {
    groups,
    disabledValues = [],
    searchPlaceholder = 'Filter…',
    variant = 'icon',
    icon = 'fa-plus',
    label = '',
    triggerClass = '',
    triggerTitle = '',
    onSelect
  }: {
    groups: IwrTypeGroup[];
    disabledValues?: string[];
    searchPlaceholder?: string;
    variant?: 'icon' | 'button';
    icon?: string;
    label?: string;
    triggerClass?: string;
    triggerTitle?: string;
    onSelect: (value: string) => void;
  } = $props();

  interface Opt { value: string; label: string; disabled: boolean; }
  interface FilteredGroup { label: string; options: Opt[]; }

  let open = $state(false);
  let query = $state('');
  let activeIndex = $state(0);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);
  let pos = $state<{ left: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, maxHeight: 320 });
  let anchor: { left: number; top: number } | null = null;

  const MENU_W = 260;

  // The menu is `position: fixed` and placed from viewport coords, but an ancestor
  // (`.editor-body` has `container-type: inline-size`) becomes the containing block for fixed
  // descendants — so left/top would resolve against that scrolled box, not the viewport, and the
  // menu lands far from its trigger. Re-parent to the window root to restore true viewport-fixed
  // positioning (and escape any overflow clip), staying in this window's stacking context.
  function portal(node: HTMLElement) {
    const host = triggerEl?.closest('.application') ?? document.body;
    host.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  const disabledSet = $derived(new Set(disabledValues));

  const filtered = $derived.by((): FilteredGroup[] => {
    const q = query.trim().toLowerCase();
    const out: FilteredGroup[] = [];
    for (const g of groups) {
      const opts = g.options
        .filter((o) => !q || o.label.toLowerCase().includes(q) || o.value.includes(q))
        .map((o) => ({ value: o.value, label: o.label, disabled: disabledSet.has(o.value) }));
      if (opts.length) out.push({ label: g.label, options: opts });
    }
    return out;
  });

  // Flat list of selectable options — keyboard nav skips group headers and disabled rows.
  const flatEnabled = $derived(filtered.flatMap((g) => g.options).filter((o) => !o.disabled));
  const activeValue = $derived(flatEnabled[activeIndex]?.value);

  function openMenu(): void {
    if (!triggerEl) return;
    const r = triggerEl.getBoundingClientRect();
    anchor = { left: r.left, top: r.top };
    const margin = 6;
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    let left = r.left;
    if (left + MENU_W > window.innerWidth - margin) left = window.innerWidth - MENU_W - margin;
    if (left < margin) left = margin;
    const openUp = below < 220 && above > below;
    pos = openUp
      ? { left, bottom: window.innerHeight - r.top + margin, maxHeight: Math.min(360, above) }
      : { left, top: r.bottom + margin, maxHeight: Math.min(360, below) };
    open = true;
    query = '';
    activeIndex = 0;
    tick().then(() => inputEl?.focus({ preventScroll: true }));
  }

  function closeMenu(): void {
    open = false;
  }

  function choose(value: string): void {
    if (disabledSet.has(value)) return;
    onSelect(value);
    closeMenu();
  }

  function moveActive(delta: number): void {
    const n = flatEnabled.length;
    if (!n) return;
    activeIndex = (activeIndex + delta + n) % n;
    tick().then(() => menuEl?.querySelector('.tfm-opt.active')?.scrollIntoView({ block: 'nearest' }));
  }

  function onInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = flatEnabled[activeIndex];
      if (opt) choose(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      triggerEl?.focus();
    }
  }

  $effect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent): void {
      const t = e.target as Node;
      if (menuEl?.contains(t) || triggerEl?.contains(t)) return;
      closeMenu();
    }
    // Close when the surrounding panel scrolls, but not when the menu's own list scrolls.
    function onScroll(e: Event): void {
      if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) return;
      // A scroll that already finished before the menu opened still delivers its event afterwards
      // (scroll events are queued to the next frame), which used to close the menu ~1ms after it
      // opened — reachable by hand mid-inertial-scroll, and always in Playwright, which scrolls the
      // trigger into view and clicks within the same frame. Close only once the anchor has really
      // moved, which is the case `position: fixed` can't follow.
      if (triggerEl && anchor) {
        const r = triggerEl.getBoundingClientRect();
        if (r.left === anchor.left && r.top === anchor.top) return;
      }
      closeMenu();
    }
    document.addEventListener('pointerdown', onDocPointer, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closeMenu);
    };
  });
</script>

<button
  bind:this={triggerEl}
  type="button"
  class="tfm-trigger {variant} {triggerClass}"
  title={triggerTitle}
  aria-label={triggerTitle || label}
  aria-haspopup="listbox"
  aria-expanded={open}
  onclick={() => (open ? closeMenu() : openMenu())}
>
  <i class="fas {icon}"></i>
  {#if label}<span>{label}</span>{/if}
</button>

{#if open}
  <div
    bind:this={menuEl}
    use:portal
    class="tfm-menu"
    role="listbox"
    tabindex="-1"
    style:left={`${pos.left}px`}
    style:top={pos.top !== undefined ? `${pos.top}px` : undefined}
    style:bottom={pos.bottom !== undefined ? `${pos.bottom}px` : undefined}
    style:max-height={`${pos.maxHeight}px`}
  >
    <input
      bind:this={inputEl}
      class="tfm-search"
      type="text"
      placeholder={searchPlaceholder}
      bind:value={query}
      oninput={() => (activeIndex = 0)}
      onkeydown={onInputKeydown}
    />
    <div class="tfm-list">
      {#each filtered as g (g.label)}
        <div class="tfm-group">{g.label}</div>
        {#each g.options as opt (opt.value)}
          <button
            type="button"
            class="tfm-opt"
            class:active={!opt.disabled && opt.value === activeValue}
            disabled={opt.disabled}
            onclick={() => choose(opt.value)}
            onpointermove={() => {
              const i = flatEnabled.findIndex((o) => o.value === opt.value);
              if (i >= 0) activeIndex = i;
            }}
          >
            {opt.label}
          </button>
        {/each}
      {/each}
      {#if filtered.length === 0}
        <div class="tfm-empty">No matches</div>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .tfm-trigger {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
  }

  .tfm-trigger.icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.2rem;
    height: 1.2rem;
    color: var(--text-muted);
    border-radius: var(--radius-sm);

    i {
      font-size: 0.75rem;
    }
  }

  .tfm-trigger.except:hover {
    color: var(--text-accent-primary);
  }

  .tfm-trigger.double:hover {
    color: var(--text-info);
  }

  /* The per-row "add exception / double-vs" triggers read as small labelled pills, not bare
     "+" icons whose purpose was unclear. */
  .tfm-trigger.icon.add-first {
    width: auto;
    height: auto;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-6);
    border: 1px solid transparent;
    font-size: var(--font-xs);
    white-space: nowrap;

    i {
      font-size: 0.6rem;
    }
  }

  .tfm-trigger.add-first.except {
    color: var(--text-accent-tertiary);
    background: var(--surface-accent-lower);
    border-color: var(--border-accent-subtle);

    &:hover {
      color: var(--text-accent-primary);
    }
  }

  .tfm-trigger.add-first.double {
    color: var(--text-info-tertiary);
    background: var(--surface-info-lower);
    border-color: var(--border-info-darker);

    &:hover {
      color: var(--text-info);
    }
  }

  .tfm-trigger.qual-add.except {
    color: var(--text-accent-tertiary);

    &:hover {
      color: var(--text-accent-primary);
    }
  }

  .tfm-trigger.qual-add.double {
    color: var(--text-info-tertiary);

    &:hover {
      color: var(--text-info);
    }
  }

  .tfm-trigger.button {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-4) var(--space-12);
    min-height: 1.75rem;
    border: 1px dashed var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: var(--font-sm);
    transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);

    i {
      font-size: 0.7rem;
    }

    &:hover {
      color: var(--text-primary);
      border-color: var(--border-medium);
      background: var(--hover-low);
    }
  }

  .tfm-menu {
    position: fixed;
    z-index: var(--z-popover);
    width: 260px;
    display: flex;
    flex-direction: column;
    background: var(--surface-highest);
    border: 1px solid var(--border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-overlay);
    overflow: hidden;
  }

  .tfm-search {
    flex-shrink: 0;
    width: 100%;
    padding: var(--space-8) var(--space-10);
    background: var(--surface-lowest);
    border: none;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary);
    font-size: var(--font-sm);

    &:focus {
      outline: none;
      border-bottom-color: var(--color-primary);
    }

    &::placeholder {
      color: var(--text-muted);
    }
  }

  .tfm-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) 0;
  }

  .tfm-group {
    padding: var(--space-6) var(--space-10) var(--space-2);
    font-size: var(--font-xs);
    color: var(--text-muted);
  }

  .tfm-opt {
    all: unset;
    box-sizing: border-box;
    display: block;
    width: 100%;
    padding: var(--space-4) var(--space-12);
    font-size: var(--font-sm);
    line-height: 1.3;
    color: var(--text-secondary);
    cursor: pointer;

    &.active {
      background: var(--surface-info);
      color: var(--text-primary);
    }

    &:disabled {
      color: var(--text-disabled);
      cursor: default;
    }
  }

  .tfm-empty {
    padding: var(--space-12);
    text-align: center;
    font-size: var(--font-sm);
    color: var(--text-muted);
  }
</style>
