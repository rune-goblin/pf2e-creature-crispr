<script lang="ts">
   import { tick } from 'svelte';
   import { SKILLS } from '@/creature-builder/editor/creatureEditorUtils';
   import { DAMAGE_TYPES } from '@/creature-builder/logic/models';
   import {
      buildInlineElement,
      defaultSpec,
      INLINE_CONDITIONS,
      SAVE_TYPES,
      DC_TIERS,
      DAMAGE_TIERS,
      PERSISTENT_TIERS,
      TEMPLATE_SHAPES,
      TIER_LABEL,
      type InlineElementSpec,
      type InlineElementKind
   } from '@/creature-builder/logic/inlineElements';
   import { scaleDC, scaleDamage, scalePersistentDamage } from '@/creature-builder/logic/abilityScaling';
   import EnrichedHtml from '../baseComponents/EnrichedHtml.svelte';

   let {
      level,
      enrich,
      oninsert
   }: {
      level: number;
      enrich?: (html: string) => Promise<string>;
      oninsert: (spec: InlineElementSpec) => void;
   } = $props();

   // The description editor lives inside `.ability-card { overflow: hidden }`, so an in-place popover
   // is clipped. Re-parent to the app-window root (matching RowActionsMenu) and use position:fixed.
   function portal(node: HTMLElement) {
      const host = triggerEl?.closest('.application') ?? document.body;
      host.appendChild(node);
      return { destroy: () => node.remove() };
   }

   interface Leaf { kind: InlineElementKind; label: string; ex: string }
   interface Category { id: string; label: string; icon: string; desc: string; items?: Leaf[]; direct?: InlineElementKind }

   const CATEGORIES: Category[] = [
      {
         id: 'check', label: 'Check', icon: 'fa-dice-d20',
         desc: 'Roll a saving throw, skill, Perception, or flat check against a DC.',
         items: [
            { kind: 'save', label: 'Saving throw', ex: 'DC 29 Will' },
            { kind: 'skill', label: 'Skill check', ex: 'DC 30 Athletics' },
            { kind: 'perception', label: 'Perception', ex: 'DC 30' },
            { kind: 'flat', label: 'Flat check', ex: 'DC 5' }
         ]
      },
      {
         id: 'damage', label: 'Damage', icon: 'fa-burst',
         desc: 'A damage roll — instant, persistent, or healing.',
         items: [
            { kind: 'damage', label: 'Damage', ex: '2d6 fire' },
            { kind: 'persistent', label: 'Persistent damage', ex: '1d6 persistent bleed' },
            { kind: 'healing', label: 'Healing', ex: '2d8 healing' }
         ]
      },
      { id: 'template', label: 'Area template', icon: 'fa-circle-dot', desc: 'A measured area a player can drop on the scene.', direct: 'template' },
      { id: 'condition', label: 'Condition', icon: 'fa-droplet', desc: 'Link a condition, with a value where it takes one.', direct: 'condition' },
      { id: 'roll', label: 'Roll', icon: 'fa-dice', desc: 'A raw dice expression, e.g. a duration or movement roll.', direct: 'roll' }
   ];

   const KIND_TITLE: Record<InlineElementKind, string> = {
      save: 'Saving throw', skill: 'Skill check', perception: 'Perception', flat: 'Flat check',
      damage: 'Damage', persistent: 'Persistent damage', healing: 'Healing',
      template: 'Area template', condition: 'Condition', roll: 'Roll'
   };

   let open = $state(false);
   let view = $state<'menu' | 'config'>('menu');
   let activeCat = $state<string>('check');
   let spec = $state<InlineElementSpec>(defaultSpec('save', 1));
   let conditionQuery = $state('');

   let triggerEl = $state<HTMLButtonElement | null>(null);
   let menuEl = $state<HTMLDivElement | null>(null);
   let pos = $state<{ left: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, maxHeight: 420 });

   const POP_W = 440;

   const activeCategory = $derived(CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0]);
   const built = $derived(buildInlineElement(spec, level, 0));
   const filteredConditions = $derived(
      INLINE_CONDITIONS.filter((c) => c.name.toLowerCase().includes(conditionQuery.trim().toLowerCase()))
   );

   function position(): void {
      if (!triggerEl) return;
      const r = triggerEl.getBoundingClientRect();
      const margin = 6;
      const below = window.innerHeight - r.bottom - margin;
      const above = r.top - margin;
      let left = r.left;
      if (left + POP_W > window.innerWidth - margin) left = window.innerWidth - POP_W - margin;
      if (left < margin) left = margin;
      const openUp = below < 300 && above > below;
      pos = openUp
         ? { left, bottom: window.innerHeight - r.top + margin, maxHeight: Math.min(460, above) }
         : { left, top: r.bottom + margin, maxHeight: Math.min(460, below) };
   }

   function openMenu(): void {
      view = 'menu';
      activeCat = 'check';
      position();
      open = true;
      tick().then(() => menuEl?.focus({ preventScroll: true }));
   }

   function close(): void {
      open = false;
   }

   function toggle(): void {
      open ? close() : openMenu();
   }

   function openConfig(kind: InlineElementKind): void {
      spec = defaultSpec(kind, level);
      conditionQuery = '';
      view = 'config';
      tick().then(position);
   }

   // spec is a discriminated union; every field patch below fires inside the matching
   // {#if spec.kind === …} block, so merging a partial and re-asserting the union is sound.
   // (TS widens `spec` back to the full union inside handler closures, defeating narrowing.)
   function updateSpec(changes: object): void {
      spec = { ...spec, ...changes } as InlineElementSpec;
   }

   function pickCondition(name: string, valued: boolean): void {
      if (spec.kind !== 'condition') return;
      spec = { ...spec, name, valued, value: valued ? spec.value : 1 };
   }

   function confirmInsert(): void {
      oninsert(spec);
      close();
   }

   function tierDcLabel(tier: 'moderate' | 'high' | 'extreme'): number {
      return scaleDC(tier === 'moderate' ? 0 : tier === 'high' ? 0.5 : 1, level);
   }
   function tierDamageLabel(tier: string): string {
      const scalar = tier === 'low' ? 0 : tier === 'moderate' ? 1 / 3 : tier === 'high' ? 2 / 3 : 1;
      return scaleDamage(scalar, level);
   }
   function tierPersistentLabel(tier: string): string {
      return scalePersistentDamage(tier === 'low' ? 0 : tier === 'moderate' ? 0.5 : 1, level);
   }

   $effect(() => {
      if (!open) return;
      function onDocPointer(e: PointerEvent): void {
         const t = e.target as Node;
         if (menuEl?.contains(t) || triggerEl?.contains(t)) return;
         close();
      }
      function onScroll(e: Event): void {
         if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) return;
         close();
      }
      document.addEventListener('pointerdown', onDocPointer, true);
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', close);
      return () => {
         document.removeEventListener('pointerdown', onDocPointer, true);
         window.removeEventListener('scroll', onScroll, true);
         window.removeEventListener('resize', close);
      };
   });
</script>

<button
   bind:this={triggerEl}
   type="button"
   class="iei-trigger"
   class:open
   aria-haspopup="menu"
   aria-expanded={open}
   onclick={toggle}
>
   <i class="fas fa-plus"></i>
   <span>Add inline element</span>
   <i class="fas fa-chevron-down caret"></i>
</button>

{#if open}
   <div
      bind:this={menuEl}
      use:portal
      class="iei-pop"
      role="dialog"
      aria-label="Insert inline element"
      tabindex="-1"
      onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(); triggerEl?.focus(); } }}
      style:left={`${pos.left}px`}
      style:top={pos.top !== undefined ? `${pos.top}px` : undefined}
      style:bottom={pos.bottom !== undefined ? `${pos.bottom}px` : undefined}
      style:max-height={`${pos.maxHeight}px`}
   >
      <div class="iei-head">
         {#if view === 'config'}
            <button type="button" class="iei-back" title="Back" aria-label="Back to element list" onclick={() => (view = 'menu')}>
               <i class="fas fa-chevron-left"></i>
            </button>
            <span class="iei-title">{KIND_TITLE[spec.kind]}</span>
         {:else}
            <span class="iei-title">Add inline element</span>
            <span class="iei-sub">choose a type</span>
         {/if}
      </div>

      {#if view === 'menu'}
         <div class="iei-menu">
            <div class="iei-cats">
               {#each CATEGORIES as cat (cat.id)}
                  <button
                     type="button"
                     class="iei-cat"
                     class:active={activeCat === cat.id}
                     onmouseenter={() => (activeCat = cat.id)}
                     onfocus={() => (activeCat = cat.id)}
                     onclick={() => (cat.direct ? openConfig(cat.direct) : (activeCat = cat.id))}
                  >
                     <i class="fas {cat.icon} ci"></i>
                     <span class="cflex">{cat.label}</span>
                     {#if !cat.direct}<i class="fas fa-chevron-right arr"></i>{/if}
                  </button>
               {/each}
            </div>
            <div class="iei-items">
               <p class="iei-desc">{activeCategory.desc}</p>
               {#if activeCategory.items}
                  {#each activeCategory.items as leaf (leaf.kind)}
                     <button type="button" class="iei-item" onclick={() => openConfig(leaf.kind)}>
                        <span>{leaf.label}</span>
                        <span class="ex">{leaf.ex}</span>
                     </button>
                  {/each}
               {:else}
                  <button type="button" class="iei-item" onclick={() => activeCategory.direct && openConfig(activeCategory.direct)}>
                     <span>Configure {activeCategory.label.toLowerCase()}…</span>
                  </button>
               {/if}
            </div>
         </div>
      {:else}
         <div class="iei-cfg">
            {#if spec.kind === 'save'}
               <div class="field">
                  <span class="flabel">Save</span>
                  <div class="chips">
                     {#each SAVE_TYPES as s (s.value)}
                        <button type="button" class="chip" class:on={spec.kind === 'save' && spec.save === s.value}
                           onclick={() => updateSpec({ save: s.value })}>{s.label}</button>
                     {/each}
                  </div>
               </div>
               <div class="field">
                  <span class="flabel">Difficulty <span class="fsub">— sets the DC from the creature's level; stays editable after</span></span>
                  <div class="chips">
                     {#each DC_TIERS as t (t)}
                        <button type="button" class="chip" class:on={spec.kind === 'save' && spec.tier === t}
                           onclick={() => updateSpec({ tier: t })}>{TIER_LABEL[t]}<span class="dc">DC {tierDcLabel(t)}</span></button>
                     {/each}
                  </div>
               </div>
               <label class="checkline">
                  <input type="checkbox" checked={spec.basic} onchange={(e) => updateSpec({ basic: e.currentTarget.checked })} />
                  Basic save
               </label>
            {:else if spec.kind === 'skill'}
               <div class="row2">
                  <div class="field">
                     <span class="flabel">Skill</span>
                     <select class="inp" value={spec.skill} onchange={(e) => updateSpec({ skill: e.currentTarget.value })}>
                        {#each SKILLS as s (s)}<option value={s}>{s}</option>{/each}
                     </select>
                  </div>
                  <div class="field">
                     <span class="flabel">DC</span>
                     <input class="inp mono" type="number" min="1" value={spec.dc}
                        oninput={(e) => updateSpec({ dc: e.currentTarget.valueAsNumber })} />
                  </div>
               </div>
            {:else if spec.kind === 'perception'}
               <div class="field">
                  <span class="flabel">DC</span>
                  <input class="inp mono" type="number" min="1" value={spec.dc}
                     oninput={(e) => updateSpec({ dc: e.currentTarget.valueAsNumber })} />
               </div>
            {:else if spec.kind === 'flat'}
               <div class="field">
                  <span class="flabel">DC <span class="fsub">— e.g. 5 to recover, 11 for concealment</span></span>
                  <input class="inp mono" type="number" min="1" value={spec.dc}
                     oninput={(e) => updateSpec({ dc: e.currentTarget.valueAsNumber })} />
               </div>
            {:else if spec.kind === 'damage'}
               <div class="field">
                  <span class="flabel">Amount <span class="fsub">— tier for the level; edit the dice after inserting</span></span>
                  <div class="chips">
                     {#each DAMAGE_TIERS as t (t)}
                        <button type="button" class="chip" class:on={spec.kind === 'damage' && spec.tier === t}
                           onclick={() => updateSpec({ tier: t })}>{TIER_LABEL[t]}<span class="dc">{tierDamageLabel(t)}</span></button>
                     {/each}
                  </div>
               </div>
               <div class="field">
                  <span class="flabel">Damage type</span>
                  <select class="inp" value={spec.damageType} onchange={(e) => updateSpec({ damageType: e.currentTarget.value })}>
                     {#each DAMAGE_TYPES as d (d)}<option value={d}>{d}</option>{/each}
                  </select>
               </div>
            {:else if spec.kind === 'persistent'}
               <div class="field">
                  <span class="flabel">Amount</span>
                  <div class="chips">
                     {#each PERSISTENT_TIERS as t (t)}
                        <button type="button" class="chip" class:on={spec.kind === 'persistent' && spec.tier === t}
                           onclick={() => updateSpec({ tier: t })}>{TIER_LABEL[t]}<span class="dc">{tierPersistentLabel(t)}</span></button>
                     {/each}
                  </div>
               </div>
               <div class="field">
                  <span class="flabel">Damage type</span>
                  <select class="inp" value={spec.damageType} onchange={(e) => updateSpec({ damageType: e.currentTarget.value })}>
                     {#each DAMAGE_TYPES as d (d)}<option value={d}>{d}</option>{/each}
                  </select>
               </div>
            {:else if spec.kind === 'healing'}
               <div class="field">
                  <span class="flabel">Dice</span>
                  <input class="inp mono" value={spec.dice} placeholder="2d8"
                     oninput={(e) => updateSpec({ dice: e.currentTarget.value })} />
               </div>
            {:else if spec.kind === 'template'}
               <div class="field">
                  <span class="flabel">Shape</span>
                  <div class="chips">
                     {#each TEMPLATE_SHAPES as sh (sh)}
                        <button type="button" class="chip" class:on={spec.kind === 'template' && spec.shape === sh}
                           onclick={() => updateSpec({ shape: sh })}>{sh[0].toUpperCase() + sh.slice(1)}</button>
                     {/each}
                  </div>
               </div>
               <div class="field">
                  <span class="flabel">Distance <span class="fsub">feet</span></span>
                  <input class="inp mono" type="number" min="5" step="5" value={spec.distance}
                     oninput={(e) => updateSpec({ distance: e.currentTarget.valueAsNumber })} />
               </div>
            {:else if spec.kind === 'condition'}
               <input class="inp" placeholder="Search conditions…" value={conditionQuery}
                  oninput={(e) => (conditionQuery = e.currentTarget.value)} />
               <div class="cond-list">
                  {#each filteredConditions as c (c.name)}
                     <button type="button" class="cond-opt" class:on={spec.kind === 'condition' && spec.name === c.name}
                        onclick={() => pickCondition(c.name, c.valued)}>
                        <span>{c.name}</span>
                        {#if c.valued}<span class="valued">takes a value</span>{/if}
                     </button>
                  {/each}
               </div>
               {#if spec.valued}
                  <div class="field">
                     <span class="flabel">Value</span>
                     <input class="inp mono" type="number" min="1" value={spec.value}
                        oninput={(e) => updateSpec({ value: e.currentTarget.valueAsNumber })} />
                  </div>
               {/if}
            {:else if spec.kind === 'roll'}
               <div class="field">
                  <span class="flabel">Expression</span>
                  <input class="inp mono" value={spec.expression} placeholder="1d20+5"
                     oninput={(e) => updateSpec({ expression: e.currentTarget.value })} />
               </div>
            {/if}

            <div class="preview">
               <span class="pv-label">Preview</span>
               <span class="pv-pill"><EnrichedHtml html={built.preview} {enrich} /></span>
            </div>
            <div class="cfg-foot">
               <code class="syntax">{built.preview}</code>
               <button type="button" class="btn-insert" onclick={confirmInsert}>Insert</button>
            </div>
         </div>
      {/if}
   </div>
{/if}

<style lang="scss">
   .iei-trigger {
      all: unset;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: var(--space-6);
      padding: var(--space-4) var(--space-10);
      border: 1px solid var(--surface-primary-border, var(--color-primary));
      border-radius: var(--radius-sm);
      background: var(--surface-primary-low);
      color: var(--text-primary);
      font-size: var(--font-xs);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition: background var(--transition-fast);

      &:hover,
      &.open {
         background: color-mix(in srgb, var(--color-primary) 22%, transparent);
      }

      i {
         font-size: 0.7rem;
         color: var(--color-primary);
      }
      .caret {
         font-size: var(--font-2xs, 0.55rem);
      }
   }

   .iei-pop {
      position: fixed;
      z-index: var(--z-popover);
      width: 440px;
      max-width: calc(100vw - 12px);
      display: flex;
      flex-direction: column;
      background: var(--surface-highest);
      border: 1px solid var(--border-medium);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-overlay);
      overflow: hidden;
   }

   .iei-head {
      display: flex;
      align-items: center;
      gap: var(--space-8);
      padding: var(--space-8) var(--space-12);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface);

      .iei-title {
         font-size: var(--font-sm);
         font-weight: var(--font-weight-semibold);
         color: var(--text-primary);
      }
      .iei-sub {
         font-size: var(--font-xs);
         color: var(--text-muted);
      }
   }

   .iei-back {
      all: unset;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.4rem;
      height: 1.4rem;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      cursor: pointer;
      &:hover { background: var(--hover); color: var(--text-primary); }
   }

   .iei-menu {
      display: grid;
      grid-template-columns: 150px 1fr;
      min-height: 210px;
      overflow-y: auto;
   }

   .iei-cats {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: var(--space-6);
      border-right: 1px solid var(--border-subtle);
   }

   .iei-cat {
      all: unset;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: var(--space-8);
      padding: var(--space-8) var(--space-8);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      cursor: pointer;
      font-size: var(--font-sm);
      font-weight: var(--font-weight-medium);

      .ci { width: 1rem; text-align: center; font-size: var(--font-xs); color: var(--text-muted); }
      .cflex { flex: 1; }
      .arr { font-size: var(--font-2xs, 0.55rem); color: var(--text-muted); }

      &:hover,
      &.active {
         background: var(--hover);
         color: var(--text-primary);
         .ci { color: var(--text-primary); }
      }
      &.active { box-shadow: inset 2px 0 0 var(--color-primary); }
   }

   .iei-items {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-8);
      overflow-y: auto;

      .iei-desc {
         margin: 0 0 var(--space-6);
         padding-bottom: var(--space-8);
         border-bottom: 1px solid var(--border-subtle);
         font-size: var(--font-xs);
         color: var(--text-muted);
      }
   }

   .iei-item {
      all: unset;
      box-sizing: border-box;
      display: flex;
      align-items: baseline;
      gap: var(--space-8);
      padding: var(--space-6) var(--space-8);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      cursor: pointer;
      font-size: var(--font-sm);

      &:hover { background: var(--hover); }
      .ex { margin-left: auto; font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--font-xs); color: var(--text-muted); }
   }

   .iei-cfg {
      display: flex;
      flex-direction: column;
      gap: var(--space-12);
      padding: var(--space-12);
      overflow-y: auto;
   }

   .field { display: flex; flex-direction: column; gap: var(--space-6); }
   .flabel { font-size: var(--font-xs); font-weight: var(--font-weight-semibold); color: var(--text-secondary); }
   .fsub { font-weight: var(--font-weight-normal); color: var(--text-muted); }
   .row2 { display: grid; grid-template-columns: 1fr auto; gap: var(--space-8); }

   .chips { display: flex; flex-wrap: wrap; gap: var(--space-6); }
   .chip {
      all: unset;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-10);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: var(--surface-lowest);
      color: var(--text-secondary);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;

      &:hover { border-color: var(--border-medium); color: var(--text-primary); }
      &.on { background: var(--surface-primary-low); border-color: var(--color-primary); color: var(--text-primary); }
      .dc { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--font-xs); color: var(--text-muted); }
   }

   .inp {
      box-sizing: border-box;
      width: 100%;
      padding: var(--space-6) var(--space-8);
      background: var(--surface-lowest);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font: inherit;
      font-size: var(--font-sm);
      outline: none;

      &.mono { font-family: var(--font-mono, ui-monospace, monospace); }
      &:focus { border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary); }
   }
   input[type='number'].inp { width: 5rem; }
   .row2 input[type='number'].inp { width: 4.5rem; text-align: center; }

   .checkline { display: flex; align-items: center; gap: var(--space-8); font-size: var(--font-sm); color: var(--text-secondary); cursor: pointer; }

   .cond-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      max-height: 150px;
      overflow-y: auto;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: var(--space-4);
   }
   .cond-opt {
      all: unset;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: var(--space-8);
      padding: var(--space-4) var(--space-8);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      cursor: pointer;
      font-size: var(--font-sm);

      &:hover { background: var(--hover); color: var(--text-primary); }
      &.on { background: var(--surface-primary-low); color: var(--text-primary); box-shadow: inset 2px 0 0 var(--color-primary); }
      .valued { margin-left: auto; font-size: var(--font-xs); color: var(--text-muted); }
   }

   .preview {
      display: flex;
      align-items: center;
      gap: var(--space-8);
      padding: var(--space-8) var(--space-10);
      background: var(--surface-lowest);
      border: 1px dashed var(--border-medium);
      border-radius: var(--radius-sm);

      .pv-label { font-size: var(--font-2xs, 0.6rem); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: var(--font-weight-semibold); }
      .pv-pill { font-size: var(--font-sm); color: var(--text-secondary); }
   }

   .cfg-foot {
      display: flex;
      align-items: center;
      gap: var(--space-8);

      .syntax {
         flex: 1;
         min-width: 0;
         font-family: var(--font-mono, ui-monospace, monospace);
         font-size: var(--font-2xs, 0.65rem);
         color: var(--text-muted);
         white-space: nowrap;
         overflow: hidden;
         text-overflow: ellipsis;
      }
   }

   .btn-insert {
      all: unset;
      box-sizing: border-box;
      padding: var(--space-6) var(--space-16);
      border-radius: var(--radius-sm);
      background: var(--btn-primary-bg);
      color: var(--text-primary);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      &:hover { background: var(--btn-primary-hover, var(--btn-primary-bg)); }
   }
</style>
