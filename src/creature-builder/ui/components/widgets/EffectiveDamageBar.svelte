<script lang="ts">
   import type { BenchmarkBarRow } from '@/creature-builder/editor/creatureEditorUtils';

   let { row }: { row: BenchmarkBarRow } = $props();
</script>

<div class="bench tone-{row.tone}">
   <div class="bench-track">
      <div class="track-line"></div>
      {#each row.markers as m, i (m.label)}
         <div
            class="marker"
            class:edge-start={i === 0}
            class:edge-end={i === row.markers.length - 1}
            style="left:{m.position * 100}%"
         >
            <span class="marker-value">{m.value}</span>
            <span class="marker-tick"></span>
            <span class="marker-label">{m.label}</span>
         </div>
      {/each}
      {#if row.hasPersistent}
         <!-- Persistent span: base → the max (end-cap); a dot marks the average, omitted for flat values. -->
         <span class="span-line" style="left:{row.basePosition * 100}%; width:{(row.effectivePosition - row.basePosition) * 100}%"></span>
         {#if row.showDot}
            <span class="span-dot" style="left:{row.midPosition * 100}%"></span>
         {/if}
         <span class="span-cap" style="left:{row.effectivePosition * 100}%"></span>
      {/if}
      <span class="pointer" style="left:{row.basePosition * 100}%"></span>
      {#each row.overflowMarkers as o (o.side)}
         <!-- Value pinned to an edge the graph extended past the tiers (out of recommended range). -->
         <span class="overflow-value {o.side}">{o.value}</span>
      {/each}
   </div>
   <div class="verdict">→ {row.verdict}</div>
</div>

<style lang="scss">
   /* Tone (effective tier) colors the arrow, span and verdict via currentColor; markers stay neutral. */
   .bench {
      margin-top: var(--space-12);
   }

   .bench-track {
      position: relative;
      height: 42px;
      margin: var(--space-16) 0 var(--space-4);
   }

   .track-line {
      position: absolute;
      top: 24px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--border-medium);
   }

   .marker {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      white-space: nowrap;
   }

   /* First/last tier captions justify to their edge so the wide "Extreme" label (and "Low")
      sit inside the frame instead of centering half past the bar's end. The tick still lands on
      the marker's true position — it's the box's inner edge either way. */
   .marker.edge-start {
      transform: none;
      align-items: flex-start;
   }

   .marker.edge-end {
      transform: translateX(-100%);
      align-items: flex-end;
   }

   .marker-value {
      font-size: var(--font-xs);
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
   }

   .marker-tick {
      width: 1px;
      height: 8px;
      background: var(--border-medium);
      margin: 2px 0;
   }

   .marker-label {
      font-size: 0.625rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-tertiary);
   }

   /* Down-caret marking the base (direct) attack; sits just above the track line. */
   .pointer {
      position: absolute;
      top: 15px;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 7px solid currentColor;
      transition: left 0.15s ease;
   }

   /* Persistent rider: the line overlays the track from base to the effective max. */
   .span-line {
      position: absolute;
      top: 23px;
      height: 3px;
      background: currentColor;
      border-radius: 1px;
      transition: left 0.15s ease, width 0.15s ease;
   }

   .span-dot {
      position: absolute;
      top: 20px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: currentColor;
      transform: translateX(-50%);
      transition: left 0.15s ease;
   }

   .span-cap {
      position: absolute;
      top: 19px;
      width: 2px;
      height: 11px;
      background: currentColor;
      transform: translateX(-50%);
      transition: left 0.15s ease;
   }

   /* Out-of-range value, pinned flush to the extended edge and tinted with the tone. */
   .overflow-value {
      position: absolute;
      top: 0;
      font-size: var(--font-xs);
      font-weight: var(--font-weight-bold);
      font-variant-numeric: tabular-nums;
      color: currentColor;
   }

   .overflow-value.start { left: 0; }
   .overflow-value.end { right: 0; }

   .verdict {
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
   }

   /* Tones follow CRISPR's benchmark heat ramp (cf. BenchmarkBadge): info→success→accent→brand. */
   .tone-below { color: var(--text-muted); }
   .tone-low { color: var(--text-info); }
   .tone-moderate { color: var(--text-success); }
   .tone-high { color: var(--text-accent-primary); }
   .tone-extreme { color: var(--text-brand); }
</style>
