<script lang="ts">
  import { tick } from 'svelte';

  // The row lives inside an `overflow:auto` table; rendering the menu in place lets that
  // container clip it and — worse — focusing it scrolls the container, firing the scroll-close
  // handler the same frame it opens. Re-parent to the app window root (not <body>, which sits
  // below focused-window/other-module z-index in a real world) so it stays in this window's
  // stacking context, above the table, while `position: fixed` keeps it out of the overflow clip.
  function portal(node: HTMLElement) {
    const host = triggerEl?.closest('.application') ?? document.body;
    host.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  export interface RowAction {
    label: string;
    icon: string;
    onSelect: () => void;
    danger?: boolean;
    dividerBefore?: boolean;
  }

  let {
    actions,
    triggerTitle = 'Actions'
  }: {
    actions: RowAction[];
    triggerTitle?: string;
  } = $props();

  let open = $state(false);
  let activeIndex = $state(0);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let pos = $state<{ left: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, maxHeight: 320 });

  const MENU_W = 220;

  function openMenu(): void {
    if (!triggerEl) return;
    const r = triggerEl.getBoundingClientRect();
    const margin = 6;
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const estHeight = Math.min(360, actions.length * 34 + 8);
    // Right-align the menu under the kebab, clamped to the viewport.
    let left = r.right - MENU_W;
    if (left + MENU_W > window.innerWidth - margin) left = window.innerWidth - MENU_W - margin;
    if (left < margin) left = margin;
    const openUp = below < estHeight && above > below;
    pos = openUp
      ? { left, bottom: window.innerHeight - r.top + margin, maxHeight: Math.min(360, above) }
      : { left, top: r.bottom + margin, maxHeight: Math.min(360, below) };
    open = true;
    activeIndex = 0;
    tick().then(() => menuEl?.focus({ preventScroll: true }));
  }

  function closeMenu(): void {
    open = false;
  }

  function choose(action: RowAction): void {
    action.onSelect();
    closeMenu();
  }

  function move(delta: number): void {
    const n = actions.length;
    if (!n) return;
    activeIndex = (activeIndex + delta + n) % n;
    tick().then(() => menuEl?.querySelector('.ram-item.active')?.scrollIntoView({ block: 'nearest' }));
  }

  function onMenuKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const a = actions[activeIndex];
      if (a) choose(a);
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
    function onScroll(e: Event): void {
      if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) return;
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
  class="ram-trigger"
  class:open
  title={triggerTitle}
  aria-label={triggerTitle}
  aria-haspopup="menu"
  aria-expanded={open}
  onclick={() => (open ? closeMenu() : openMenu())}
>
  <i class="fas fa-ellipsis-vertical"></i>
</button>

{#if open}
  <div
    bind:this={menuEl}
    use:portal
    class="ram-menu"
    role="menu"
    tabindex="-1"
    onkeydown={onMenuKeydown}
    style:left={`${pos.left}px`}
    style:top={pos.top !== undefined ? `${pos.top}px` : undefined}
    style:bottom={pos.bottom !== undefined ? `${pos.bottom}px` : undefined}
    style:max-height={`${pos.maxHeight}px`}
  >
    {#each actions as action, i (action.label)}
      <button
        type="button"
        class="ram-item"
        class:active={i === activeIndex}
        class:danger={action.danger}
        class:divided={action.dividerBefore}
        role="menuitem"
        onclick={() => choose(action)}
        onpointermove={() => (activeIndex = i)}
      >
        <i class="fas {action.icon}"></i>
        <span>{action.label}</span>
      </button>
    {/each}
  </div>
{/if}

<style lang="scss">
  .ram-trigger {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-md);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.2s;

    &:hover,
    &.open {
      background: var(--hover);
    }
  }

  .ram-menu {
    position: fixed;
    z-index: var(--z-popover);
    width: 220px;
    display: flex;
    flex-direction: column;
    padding: var(--space-4) 0;
    background: var(--surface-highest);
    border: 1px solid var(--border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-overlay);
    overflow-y: auto;
  }

  .ram-item {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--space-8);
    width: 100%;
    padding: var(--space-6) var(--space-12);
    font-size: var(--font-sm);
    line-height: 1.3;
    color: var(--text-secondary);
    cursor: pointer;

    i {
      width: 1rem;
      text-align: center;
      font-size: var(--font-xs);
      color: var(--text-muted);
    }

    &.active {
      background: var(--hover);
      color: var(--text-primary);

      i {
        color: var(--text-primary);
      }
    }

    &.divided {
      margin-top: var(--space-4);
      border-top: 1px solid var(--border-subtle);
      padding-top: var(--space-8);
    }

    &.danger {
      color: var(--color-danger);

      i {
        color: var(--color-danger);
      }

      &.active {
        background: rgba(255, 107, 107, 0.16);
      }
    }
  }
</style>
