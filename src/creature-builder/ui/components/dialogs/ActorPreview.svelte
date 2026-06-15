<script lang="ts">
  // `id` may be either a world-actor id (game.actors.get) or a compendium
  // UUID like "Compendium.pf2e.bestiary-creatures.Actor.xxx". `source`
  // disambiguates so we pick the right resolver.
  let {
    id = '',
    source = 'world'
  }: {
    id?: string;
    source?: 'world' | 'bestiary' | 'troops' | 'armies';
  } = $props();

  let resolved = $state<any>(null);
  let loading = $state(false);

  $effect(() => {
    void loadActor(id, source);
  });

  async function loadActor(currentId: string, currentSource: string): Promise<void> {
    if (!currentId) {
      resolved = null;
      loading = false;
      return;
    }

    if (currentSource === 'bestiary') {
      loading = true;
      let entity: any = fromUuidSync(currentId);
      // The index entry from fromUuidSync lacks system data; fetch the
      // full document to get hp/ac/img.
      if (!entity?.system) {
        try {
          entity = await fromUuid(currentId);
        } catch {
          entity = null;
        }
      }
      // Guard against stale async results from a previous selection.
      if (id === currentId && source === currentSource) {
        resolved = entity;
        loading = false;
      }
    } else {
      resolved = game.actors?.get(currentId) ?? null;
      loading = false;
    }
  }

  const data = $derived(
    resolved
      ? {
          name: resolved.name,
          level: resolved.system?.details?.level?.value,
          img: resolved.prototypeToken?.texture?.src || resolved.img,
          hpCurrent: resolved.system?.attributes?.hp?.value,
          hpMax: resolved.system?.attributes?.hp?.max,
          ac: resolved.system?.attributes?.ac?.value
        }
      : null
  );
</script>

<div class="actor-preview">
  {#if loading && !data}
    <div class="preview-empty">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading…</p>
    </div>
  {:else if data}
    <div class="preview-token">
      {#if data.img}
        <img src={data.img} alt={data.name} />
      {:else}
        <i class="fas fa-user-shield preview-token-placeholder"></i>
      {/if}
    </div>
    <div class="preview-name">{data.name}</div>
    <div class="preview-level">Level {data.level ?? '—'}</div>
    <div class="preview-stats">
      <div class="preview-stat">
        <span class="preview-stat-label">HP</span>
        <span class="preview-stat-value">
          {data.hpCurrent ?? '—'} / {data.hpMax ?? '—'}
        </span>
      </div>
      <div class="preview-stat">
        <span class="preview-stat-label">AC</span>
        <span class="preview-stat-value">{data.ac ?? '—'}</span>
      </div>
    </div>
  {:else}
    <div class="preview-empty">
      <i class="fas fa-arrow-left"></i>
      <p>Select an actor to preview</p>
    </div>
  {/if}
</div>

<style lang="scss">
   .actor-preview {
      flex: 1;
      min-width: 0;
      padding: var(--space-16);
      background: var(--overlay-low);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-12);
   }

   .preview-token {
      width: 6rem;
      height: 6rem;
      border-radius: var(--radius-md);
      background: var(--overlay);
      border: 1px solid var(--border-subtle);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;

      img {
         width: 100%;
         height: 100%;
         object-fit: cover;
      }
   }

   .preview-token-placeholder {
      font-size: 2.5rem;
      color: var(--color-text-dark-secondary, #7a7971);
   }

   .preview-name {
      font-size: var(--font-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--text-primary);
      text-align: center;
      line-height: 1.2;
   }

   .preview-level {
      padding: var(--space-2) var(--space-8);
      border-radius: var(--radius-sm);
      background: var(--overlay);
      color: var(--color-text-dark-secondary, #7a7971);
      font-size: var(--font-xs);
      text-transform: uppercase;
      letter-spacing: 0.05em;
   }

   .preview-stats {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      margin-top: var(--space-8);
   }

   .preview-stat {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-6) var(--space-12);
      background: var(--overlay);
      border-radius: var(--radius-sm);
   }

   .preview-stat-label {
      font-size: var(--font-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-dark-secondary, #7a7971);
      text-transform: uppercase;
      letter-spacing: 0.05em;
   }

   .preview-stat-value {
      font-family: var(--font-family-mono, ui-monospace, monospace);
      font-size: var(--font-md);
      color: var(--text-primary);
   }

   .preview-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-8);
      color: var(--color-text-dark-secondary, #7a7971);
      font-size: var(--font-sm);
      font-style: italic;

      i {
         font-size: 1.5rem;
         opacity: 0.5;
      }

      p {
         margin: 0;
      }
   }
</style>
