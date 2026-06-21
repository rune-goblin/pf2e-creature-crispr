<script lang="ts">
  // Runs pre-rendered markup through the host's text enricher (env.enrichHtml) so inline
  // tags (@UUID condition links, @Check, @Damage, …) display as the styled content
  // links/buttons PF2e shows, instead of as raw `@UUID[...]{Quickened}` text. The enricher
  // is injected so the editor core stays Foundry-free; with none, the raw markup renders.
  let { html, enrich }: { html: string; enrich?: (html: string) => Promise<string> } = $props();

  let enriched = $state<{ source: string; result: string } | null>(null);

  // Synchronous fallback to the raw source: plain-text abilities (the common case)
  // render instantly, and a changed source shows raw rather than the stale prior
  // enrichment until the async result for the new source lands.
  const display = $derived(enriched?.source === html ? enriched.result : html);

  $effect(() => {
    const source = html;
    if (!enrich) return;
    let cancelled = false;
    void enrich(source).then((result) => {
      if (!cancelled) enriched = { source, result };
    });
    return () => {
      cancelled = true;
    };
  });
</script>

<!-- .enriched is a display:contents scope anchor only: it adds no box, but lets the content-link
     overrides below stay scoped to enriched output — a bare :global would leak to every Foundry sheet. -->
<!-- Trusted: html is PF2e-formatted markup from our own renderers, not user input. -->
<div class="enriched">{@html display}</div>

<style>
  .enriched {
    display: contents;
  }

  /* PF2e inline enricher links (conditions/effects/items, checks, rolls, areas) ship as icon +
     colored pill. Re-skin them to read as native body text: drop the icon, inherit the surrounding
     text color, keep a quiet tag. */
  .enriched :global(a.content-link),
  .enriched :global(a.inline-check),
  .enriched :global(a.inline-roll),
  .enriched :global(a.effect-area) {
    color: inherit;
    background: var(--hover-low);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-4);
    white-space: nowrap;
    text-decoration: none;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .enriched :global(a.content-link:hover),
  .enriched :global(a.inline-check:hover),
  .enriched :global(a.inline-roll:hover),
  .enriched :global(a.effect-area:hover) {
    background: var(--hover);
    border-color: var(--border-medium);
    text-shadow: none;
  }

  .enriched :global(a.content-link i),
  .enriched :global(a.content-link img),
  .enriched :global(a.content-link svg),
  .enriched :global(a.content-link .fa-stack),
  .enriched :global(a.inline-check i),
  .enriched :global(a.inline-roll i),
  .enriched :global(a.effect-area i) {
    display: none;
  }
</style>
