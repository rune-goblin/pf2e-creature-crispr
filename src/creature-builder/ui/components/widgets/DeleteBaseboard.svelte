<script lang="ts">
   interface Props {
      /** Noun for the thing being deleted, e.g. "attack" or "ability". */
      label: string;
      confirming: boolean;
      onRequest: () => void;
      onConfirm: () => void;
      onCancel: () => void;
      /** Bleed past the parent card's padding to sit flush with its frame (clipped by the
          card's overflow). Cards with no padding of their own don't need it. */
      bleed?: boolean;
   }

   let { label, confirming, onRequest, onConfirm, onCancel, bleed = false }: Props = $props();
</script>

<div class="delete-baseboard" class:confirming class:bleed>
   {#if confirming}
      <span class="delete-confirm-text">Delete this {label}?</span>
      <button type="button" class="delete-confirm-btn" onclick={onConfirm}>Delete</button>
      <button type="button" class="delete-cancel-btn" onclick={onCancel}>Cancel</button>
   {:else}
      <button type="button" class="delete-btn" title="Delete {label}" onclick={onRequest}>
         <i class="fas fa-trash"></i> Delete {label}
      </button>
   {/if}
</div>

<style lang="scss">
   /* Destructive action as a card's full-width footer — recedes to a faint divider + muted
      label at rest so it never outweighs the card's own header, tinting danger only on hover.
      Two-step confirm guards a stray click. */
   .delete-baseboard {
      display: flex;
      align-items: center;
      gap: var(--space-8);
      border-top: 1px solid var(--border-faint);

      &.bleed {
         margin: var(--space-10) calc(-1 * var(--space-10)) calc(-1 * var(--space-10));
      }

      &.confirming {
         padding: var(--space-8) var(--space-12);
         background: var(--surface-danger-lowest);
      }
   }

   .delete-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-6);
      width: 100%;
      padding: var(--space-8);
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: var(--font-weight-medium);
      transition: background var(--transition-fast), color var(--transition-fast);

      &:hover {
         background: var(--surface-danger-lowest);
         color: var(--text-danger);
      }
   }

   .delete-confirm-text {
      margin-right: auto;
      font-size: var(--font-sm);
      color: var(--text-secondary);
   }

   .delete-confirm-btn,
   .delete-cancel-btn {
      padding: var(--space-4) var(--space-12);
      border-radius: var(--radius-sm);
      font-size: var(--font-xs);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
   }

   .delete-confirm-btn {
      background: var(--surface-danger-low);
      border: 1px solid var(--border-danger);
      color: var(--text-danger);

      &:hover {
         background: var(--surface-danger);
         color: var(--text-primary);
      }
   }

   .delete-cancel-btn {
      background: var(--surface-low);
      border: 1px solid var(--border-default);
      color: var(--text-secondary);

      &:hover {
         background: var(--hover);
         color: var(--text-primary);
      }
   }
</style>
