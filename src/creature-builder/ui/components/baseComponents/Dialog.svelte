<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    show = $bindable(false),
    title = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    showConfirm = true,
    showCancel = true,
    confirmDisabled = false,
    confirmVariant = 'default',
    width = '500px',
    onConfirm,
    onCancel,
    onClose,
    children,
    footerLeft
  }: {
    show?: boolean;
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    showConfirm?: boolean;
    showCancel?: boolean;
    confirmDisabled?: boolean;
    confirmVariant?: 'default' | 'danger';
    width?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    onClose?: () => void;
    children?: Snippet;
    footerLeft?: Snippet;
  } = $props();

  // Focus the best target when the dialog mounts: a [data-autofocus] element
  // from slot content, then the primary button, cancel button, or close button.
  function autofocusDialog(node: HTMLElement) {
    const target =
      (node.querySelector('[data-autofocus]') as HTMLElement) ||
      (node.querySelector('.dialog-button-primary:not(:disabled)') as HTMLElement) ||
      (node.querySelector('.dialog-button-secondary') as HTMLElement) ||
      (node.querySelector('.dialog-close') as HTMLElement);
    target?.focus();
  }

  function draggable(node: HTMLElement) {
    const handle = node.querySelector('.dialog-header') as HTMLElement;
    if (!handle) return;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    handle.style.cursor = 'grab';

    function onMouseDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest('button')) return;
      startX = e.clientX - currentX;
      startY = e.clientY - currentY;
      handle.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e: MouseEvent) {
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;
      node.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }

    function onMouseUp() {
      handle.style.cursor = 'grab';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    handle.addEventListener('mousedown', onMouseDown);

    return {
      destroy() {
        handle.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
      }
    };
  }

  function handleConfirm() {
    if (!confirmDisabled) {
      if (onConfirm) {
        onConfirm();
      } else {
        // Default behavior when no parent handler is wired
        show = false;
      }
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
    } else {
      onClose?.();
      show = false;
    }
  }
</script>

{#if show}
  <div class="dialog-backdrop">
    <div class="dialog" style="width: {width}; max-width: {width};" use:autofocusDialog use:draggable>
      <div class="dialog-content">
        {#if title}
          <div class="dialog-header">
            <h3 class="dialog-title">{title}</h3>
            <button
              class="dialog-close"
              onclick={handleCancel}
              aria-label="Close"
              title="Close"
              tabindex="0"
            >
              <i class="fas fa-times"></i>
            </button>
          </div>
        {/if}

        <div class="dialog-body">
          {@render children?.()}
        </div>

        {#if showConfirm || showCancel}
          <div class="dialog-footer">
            <div class="dialog-footer-left">
              {@render footerLeft?.()}
            </div>
            <div class="dialog-footer-buttons">
              {#if showCancel}
                <button
                  class="dialog-button dialog-button-secondary"
                  onclick={handleCancel}
                  tabindex="0"
                >
                  {cancelLabel}
                </button>
              {/if}
              {#if showConfirm}
                <button
                  class="dialog-button dialog-button-primary"
                  class:dialog-button-danger={confirmVariant === 'danger'}
                  onclick={handleConfirm}
                  disabled={confirmDisabled}
                  tabindex="0"
                >
                  {confirmLabel}
                </button>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: var(--overlay-high);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: var(--z-overlay);
    pointer-events: auto;
  }

  .dialog {
    background: var(--surface-lowest);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-overlay);
    animation: dialogSlideIn var(--transition-base);
    pointer-events: auto;
  }

  @keyframes dialogSlideIn {
    from {
      opacity: 0;
      transform: translateY(-1.25rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dialog-content {
    padding: 0;
  }

  .dialog-header {
    padding: .5rem var(--space-24);
    border-bottom: 1px solid var(--border-subtle);
    background: var(--empty);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dialog-title {
    margin: 0;
    font-size: var(--font-2xl);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .dialog-close {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: var(--font-xl);
    cursor: pointer;
    margin-right: -var(--space-16);
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    transition: all var(--transition-base);
  }

  .dialog-close:hover {
    background: var(--hover);
    color: var(--text-primary);
  }

  .dialog-body {
    padding: var(--space-16) var(--space-24);
  }

  .dialog-footer {
    padding: var(--space-16);
    border-top: 1px solid var(--border-subtle);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-16);
  }

  .dialog-footer-left {
    display: flex;
    align-items: center;
  }

  .dialog-footer-buttons {
    display: flex;
    gap: var(--space-8);
  }

  .dialog-button {
    padding: var(--space-8) var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    font-size: var(--font-md);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-base);
    min-width: 5rem;
  }

  .dialog-button:disabled {
    opacity: var(--opacity-disabled);
    cursor: not-allowed;
  }

  .dialog-button-primary {
    background: var(--btn-secondary-bg);
    color: var(--text-primary);
    border-color: var(--border-medium);
  }

  .dialog-button-primary:hover:not(:disabled) {
    background: var(--btn-secondary-hover);
    border-color: var(--border-strong);
  }

  .dialog-button-primary:focus {
    outline: 2px solid var(--border-strong);
    outline-offset: 0.125rem;
  }

  .dialog-button-secondary {
    background: transparent;
    color: var(--text-primary);
    border-color: var(--border-medium);
  }

  .dialog-button-secondary:hover:not(:disabled) {
    background: var(--hover-low);
    border-color: var(--border-strong);
  }

  .dialog-button-danger {
    background: var(--color-red-dark);
    color: var(--text-danger);
    border-color: var(--color-red);
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
    box-shadow:
      inset 0 1px 0 hsla(0, 0%, 100%, 0.04),
      0 1px 0 hsla(0, 0%, 0%, 0.4);
  }

  .dialog-button-danger:hover:not(:disabled) {
    background: var(--color-red);
    color: hsla(0, 0%, 100%, 0.98);
    border-color: var(--color-red);
    box-shadow:
      0 0 0 1px hsla(4, 66%, 58%, 0.4),
      0 0 18px -4px hsla(4, 66%, 58%, 0.6),
      inset 0 1px 0 hsla(0, 0%, 100%, 0.1);
  }

  .dialog-button-danger:focus:not(:disabled) {
    outline: 2px solid var(--color-red);
    outline-offset: 0.125rem;
  }

  .dialog-button-danger:disabled {
    background: hsla(0, 0%, 0%, 0.35);
    color: var(--text-danger-disabled);
    border-color: var(--border-danger-faint);
    box-shadow: none;
    text-shadow: none;
  }
</style>
