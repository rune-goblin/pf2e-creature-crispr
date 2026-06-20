<script lang="ts">
   import type { EditableCreature } from '@/creature-builder/editor';
   import { CREATURE_PRESETS } from '@/creature-builder/logic/models';
   import { pickFile } from '@/creature-builder/services';
   import Dialog from '../baseComponents/Dialog.svelte';

   let {
      creature,
      expanded,
      onToggle,
      onUpdateCreature,
      onUpdateLevel,
      onApplyPreset,
      onOpenActorSheet,
      onOpenOrCreateActor
   }: {
      creature: EditableCreature;
      expanded: boolean;
      onToggle?: () => void;
      onUpdateCreature?: (detail: Partial<EditableCreature>) => void;
      onUpdateLevel?: (level: number) => void;
      onApplyPreset?: (presetKey: string) => void;
      onOpenActorSheet?: () => void;
      onOpenOrCreateActor?: () => void;
   } = $props();

   // Order: baseline → martial → hybrid → caster → skill-flex
   const TEMPLATE_OPTIONS = [
      'baseline',
      'brute',
      'soldier',
      'skirmisher',
      'sniper',
      'magicalStriker',
      'caster',
      'skillParagon'
   ] as const;

   let showTemplateConfirm = $state(false);
   let pendingTemplate = $state<string | null>(null);
   let templateSelectElement = $state<HTMLSelectElement | null>(null);

   // Matches current benchmarks against each preset; 'custom' when none fit.
   function detectCurrentTemplate(): string {
      if (!creature) return 'custom';
      const current = creature.benchmarks;

      for (const key of TEMPLATE_OPTIONS) {
         const preset = CREATURE_PRESETS[key];
         if (!preset?.benchmarks) continue;

         let matches = true;

         if (preset.benchmarks.abilities) {
            for (const [ability, value] of Object.entries(preset.benchmarks.abilities)) {
               if (current.abilities[ability as keyof typeof current.abilities] !== value) {
                  matches = false;
                  break;
               }
            }
         }

         if (!matches) continue;

         if (preset.benchmarks.ac !== undefined && current.ac !== preset.benchmarks.ac) continue;
         if (preset.benchmarks.hp !== undefined && current.hp !== preset.benchmarks.hp) continue;
         if (preset.benchmarks.strikeAttack !== undefined && current.strikeAttack !== preset.benchmarks.strikeAttack) continue;
         if (preset.benchmarks.strikeDamage !== undefined && current.strikeDamage !== preset.benchmarks.strikeDamage) continue;

         if (preset.benchmarks.saves) {
            if (preset.benchmarks.saves.fortitude !== undefined && current.saves.fortitude !== preset.benchmarks.saves.fortitude) continue;
            if (preset.benchmarks.saves.reflex !== undefined && current.saves.reflex !== preset.benchmarks.saves.reflex) continue;
            if (preset.benchmarks.saves.will !== undefined && current.saves.will !== preset.benchmarks.saves.will) continue;
         }

         return key;
      }

      return 'custom';
   }

   const currentTemplate = $derived(creature ? detectCurrentTemplate() : 'custom');

   function handleTemplateChange(e: Event): void {
      const target = e.currentTarget as HTMLSelectElement;
      const value = target.value;
      if (!value || value === 'custom') return;

      // Custom config is unsaved work — warn before a preset overwrites it.
      if (currentTemplate === 'custom') {
         pendingTemplate = value;
         templateSelectElement = target;
         showTemplateConfirm = true;
      } else {
         onApplyPreset?.(value);
      }
   }

   function confirmApplyTemplate(): void {
      if (pendingTemplate) {
         onApplyPreset?.(pendingTemplate);
      }
      showTemplateConfirm = false;
      pendingTemplate = null;
      templateSelectElement = null;
   }

   function cancelApplyTemplate(): void {
      if (templateSelectElement) {
         templateSelectElement.value = 'custom';
      }
      showTemplateConfirm = false;
      pendingTemplate = null;
      templateSelectElement = null;
   }

   async function selectPortraitImage(): Promise<void> {
      const path = await pickFile({ type: 'image', current: creature.portraitImage || '' });
      onUpdateCreature?.({ portraitImage: path });
   }

   async function selectTokenImage(): Promise<void> {
      const path = await pickFile({ type: 'image', current: creature.tokenImage || '' });
      onUpdateCreature?.({ tokenImage: path });
   }
</script>

<section class="editor-section" class:expanded>
   <div class="section-header">
      <button class="section-toggle" onclick={() => onToggle?.()}>
         <i class="fas fa-chevron-right toggle-icon"></i>
         <span>Basic Info</span>
      </button>
      {#if !expanded}
         <div class="header-summary">
            <button
               class="header-creature-link"
               onclick={(e) => { e.stopPropagation(); onOpenOrCreateActor?.(); }}
               title="Open actor sheet"
            >
               {creature.name || 'Unnamed Creature'}
               <i class="fas fa-external-link-alt"></i>
            </button>
            <div class="header-level-control">
               <button
                  class="header-level-btn"
                  onclick={(e) => { e.stopPropagation(); onUpdateLevel?.(creature.level - 1); }}
                  disabled={creature.level <= -1}
                  aria-label="Decrease level"
               >−</button>
               <span class="header-level-value">Lvl {creature.level}</span>
               <button
                  class="header-level-btn"
                  onclick={(e) => { e.stopPropagation(); onUpdateLevel?.(creature.level + 1); }}
                  disabled={creature.level >= 25}
                  aria-label="Increase level"
               >+</button>
            </div>
         </div>
      {/if}
   </div>
   {#if expanded}
      <div class="section-body basic-info-grid">
         <div class="portrait-column">
            <button type="button" class="portrait-image" onclick={selectPortraitImage} aria-label="Select portrait image">
               {#if creature.portraitImage}
                  <img src={creature.portraitImage} alt="" />
               {:else}
                  <div class="portrait-placeholder">
                     <i class="fas fa-user"></i>
                     <span>Portrait</span>
                  </div>
               {/if}
            </button>
            <div class="image-buttons">
               <button class="img-btn" onclick={selectPortraitImage} title="Browse" aria-label="Browse for portrait image">
                  <i class="fas fa-folder-open"></i>
               </button>
               {#if creature.portraitImage}
                  <button class="img-btn danger" onclick={() => onUpdateCreature?.({ portraitImage: undefined })} title="Remove" aria-label="Remove portrait image">
                     <i class="fas fa-times"></i>
                  </button>
               {/if}
            </div>
         </div>

         <div class="info-fields">
            <div class="field-group">
               <label for="basic-info-name">Name</label>
               <input
                  id="basic-info-name"
                  type="text"
                  class="cc-input"
                  value={creature.name}
                  oninput={(e) => onUpdateCreature?.({ name: e.currentTarget.value })}
                  placeholder="Creature Name"
               />
            </div>

            <div class="token-row">
               <button type="button" class="token-image" onclick={selectTokenImage} aria-label="Select token image">
                  {#if creature.tokenImage}
                     <img src={creature.tokenImage} alt="" />
                  {:else}
                     <div class="token-placeholder">Token</div>
                  {/if}
               </button>
               <div class="image-buttons">
                  <button class="img-btn" onclick={selectTokenImage} title="Browse" aria-label="Browse for token image">
                     <i class="fas fa-folder-open"></i>
                  </button>
                  {#if creature.tokenImage}
                     <button class="img-btn danger" onclick={() => onUpdateCreature?.({ tokenImage: undefined })} title="Remove" aria-label="Remove token image">
                        <i class="fas fa-times"></i>
                     </button>
                  {/if}
               </div>
            </div>
         </div>

         <div class="level-area">
            <label for="basic-info-level">Level</label>
            <div class="level-control" id="basic-info-level">
               <button class="level-btn" onclick={() => onUpdateLevel?.(creature.level - 1)} disabled={creature.level <= -1} aria-label="Decrease level">
                  <i class="fas fa-minus"></i>
               </button>
               <div class="level-value">{creature.level}</div>
               <button class="level-btn" onclick={() => onUpdateLevel?.(creature.level + 1)} disabled={creature.level >= 24} aria-label="Increase level">
                  <i class="fas fa-plus"></i>
               </button>
            </div>
            {#if creature.actorId}
               <button class="open-sheet-btn" onclick={() => onOpenActorSheet?.()}>
                  <i class="fas fa-external-link-alt"></i>
                  Open NPC Sheet
               </button>
            {/if}
            <div
               class="template-field"
               title="Benchmark profile for this creature — PF2e GMG road maps for individual NPCs. Overwrites abilities, AC, HP, saves, and strike attack/damage."
            >
               <label for="basic-info-template">Template</label>
               <select id="basic-info-template" class="cc-select template-select" value={currentTemplate} onchange={handleTemplateChange}>
                  {#each TEMPLATE_OPTIONS as preset (preset)}
                     <option value={preset}>{CREATURE_PRESETS[preset].name}</option>
                  {/each}
                  <option value="custom" disabled>Custom</option>
               </select>
            </div>

         </div>
      </div>
   {/if}
</section>

<Dialog
   bind:show={showTemplateConfirm}
   title="Apply Template"
   confirmLabel="Apply Template"
   cancelLabel="Cancel"
   width="400px"
   onConfirm={confirmApplyTemplate}
   onCancel={cancelApplyTemplate}
>
   <p>You will lose your custom configuration. Apply the <strong>{pendingTemplate ? CREATURE_PRESETS[pendingTemplate]?.name : ''}</strong> template?</p>
</Dialog>

<style lang="scss">
   .editor-section {
      background: var(--surface-low);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      overflow: hidden;

      &.expanded .toggle-icon {
         transform: rotate(90deg);
      }
   }

   .section-header {
      display: flex;
      align-items: center;
      gap: var(--space-12);
      padding: var(--space-4) var(--space-8);
      cursor: pointer;
   }

   .section-toggle {
      display: flex;
      align-items: center;
      gap: var(--space-8);
      flex-shrink: 0;
      padding: var(--space-4) var(--space-8);
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-size: var(--font-md);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      text-align: left;
      border-radius: var(--radius-md);

      &:hover {
         background: var(--hover-low);
      }

      .toggle-icon {
         font-size: var(--font-xs);
         color: var(--text-muted);
         transition: transform 0.15s ease;
      }
   }

   .header-summary {
      display: flex;
      align-items: center;
      gap: var(--space-12);
      margin-left: auto;
   }

   .header-creature-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-6);
      font-family: var(--font-sans);
      font-size: var(--font-md);
      font-weight: var(--font-weight-semibold);
      color: var(--text-primary);
      text-decoration: underline;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0;
      white-space: nowrap;

      i {
         font-size: var(--font-xs);
         text-decoration: none;
      }

      &:hover {
         color: var(--color-primary);
      }
   }

   .header-level-control {
      display: flex;
      align-items: center;
      gap: var(--space-4);
   }

   .header-level-btn {
      width: 1.5rem;
      height: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface-lowest);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      cursor: pointer;
      font-size: var(--font-md);

      &:hover:not(:disabled) {
         background: var(--hover-low);
         border-color: var(--border-medium);
      }

      &:disabled {
         opacity: 0.4;
         cursor: not-allowed;
      }
   }

   .header-level-value {
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--text-primary);
      min-width: 3rem;
      text-align: center;
   }

   .section-body {
      padding: var(--space-16);
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: var(--space-12);
   }

   /* Basic Info Grid Layout */
   .section-body.basic-info-grid {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--space-16);
      align-items: stretch;
   }

   .portrait-column {
      display: flex;
      gap: var(--space-8);
      align-items: flex-end;

      .portrait-image {
         width: 16rem;
         /* Explicit height, not aspect-ratio (4:5 of 16rem): as a non-stretched flex item the
            aspect-ratio's transferred height collapses to min-content in Chromium, squashing the box. */
         height: 20rem;
         background: var(--surface-lowest);
         border: 1px solid var(--border-medium);
         border-radius: var(--radius-lg);
         overflow: hidden;
         cursor: pointer;
         transition: border-color var(--transition-fast);
         padding: 0;

         &:hover {
            border-color: var(--color-primary);
         }

         img {
            width: 100%;
            height: 100%;
            object-fit: contain;
         }

         .portrait-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: var(--space-8);
            color: var(--text-muted);

            i {
               font-size: var(--font-3xl);
            }

            span {
               font-size: var(--font-sm);
            }
         }
      }

      .image-buttons {
         display: flex;
         flex-direction: column;
         gap: var(--space-4);
      }
   }

   .img-btn {
      width: 1.75rem;
      height: 1.75rem;
      border: 1px solid var(--border-medium);
      border-radius: var(--radius-sm);
      background: var(--surface-lowest);
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--font-xs);
      transition: all var(--transition-fast);

      &:hover {
         background: var(--hover);
         border-color: var(--color-primary);
         color: var(--text-primary);
      }

      &.danger:hover {
         background: var(--surface-danger-low);
         border-color: var(--border-danger-subtle);
         color: var(--text-danger);
      }
   }

   .info-fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-12);

      .field-group {
         display: flex;
         flex-direction: column;
         gap: var(--space-4);

         label {
            font-size: var(--font-sm);
            color: var(--text-secondary);
            font-weight: var(--font-weight-medium);
         }

         :global(.cc-input), :global(.cc-select) {
            width: 100%;
         }
      }

      .token-row {
         display: flex;
         align-items: flex-end;
         gap: var(--space-8);
         margin-top: auto;
         width: fit-content;

         .token-image {
            width: 10rem;
            height: 10rem;
            cursor: pointer;
            padding: 0;
            background: transparent;
            border: none;

            img {
               width: 100%;
               height: 100%;
               object-fit: contain;
               object-position: bottom;
            }

            .token-placeholder {
               width: 10rem;
               height: 10rem;
               display: flex;
               align-items: center;
               justify-content: center;
               background: var(--surface-lowest);
               border: 1px solid var(--border-medium);
               border-radius: var(--radius-md);
               color: var(--text-muted);
               font-size: var(--font-sm);
            }
         }

         .image-buttons {
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
         }
      }
   }

   .level-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-8);

      label {
         font-size: var(--font-sm);
         color: var(--text-secondary);
         font-weight: var(--font-weight-medium);
      }

      .level-control {
         display: flex;
         align-items: center;
         gap: var(--space-8);

         .level-btn {
            min-height: 2.375rem;
            padding: 0 var(--space-12);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md);
            background: var(--surface-lowest);
            color: var(--text-primary);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-md);
            transition: all var(--transition-fast);

            &:hover:not(:disabled) {
               background: var(--hover);
               border-color: var(--color-primary);
            }

            &:disabled {
               opacity: 0.3;
               cursor: not-allowed;
            }
         }

         .level-value {
            min-height: 2.375rem;
            padding: 0 var(--space-16);
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--surface-lowest);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md);
            font-size: var(--font-md);
            font-weight: var(--font-weight-bold);
            color: var(--text-primary);
         }
      }

      .open-sheet-btn {
         display: inline-flex;
         align-items: center;
         gap: var(--space-6);
         padding: var(--space-6) var(--space-12);
         background: transparent;
         border: 1px solid var(--border-medium);
         border-radius: var(--radius-md);
         color: var(--text-secondary);
         font-size: var(--font-sm);
         cursor: pointer;
         transition: all var(--transition-fast);

         &:hover {
            background: var(--hover);
            border-color: var(--color-primary);
            color: var(--text-primary);
         }

         i {
            font-size: var(--font-xs);
         }
      }

      .template-field {
         display: flex;
         flex-direction: column;
         align-items: center;
         gap: var(--space-4);
         margin-top: var(--space-8);

         label {
            font-size: var(--font-xs);
            color: var(--text-muted);
         }

         .template-select {
            min-height: auto;
            padding: var(--space-4) var(--space-24) var(--space-4) var(--space-8);
            font-size: var(--font-sm);

            &:disabled {
               opacity: 0.5;
               cursor: not-allowed;
            }
         }
      }

   }
</style>
