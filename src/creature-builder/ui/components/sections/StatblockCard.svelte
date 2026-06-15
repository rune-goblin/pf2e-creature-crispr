<script lang="ts">
  import { ABILITY_SCORES, ABILITY_SCORE_LABELS } from '@/creature-builder/models';
  import {
    formatStat,
    computeStrikeStats,
    SPELL_PROGRESSION_LABELS,
    SPELL_TRADITION_LABELS,
    formatSpellSlotSummary
  } from '@/creature-builder/editor/creatureEditorUtils';
  import type { EditableCreature, CreatureStats } from '@/creature-builder/editor';

  let {
    creature,
    computedStats
  }: {
    creature: EditableCreature;
    computedStats: CreatureStats;
  } = $props();
</script>

<section class="statblock-card">
   <div class="statblock-header">
      {#if creature.portraitImage}
         <div class="portrait-thumb">
            <img src={creature.portraitImage} alt="" />
         </div>
      {/if}
      <div class="name-section">
         <h2 class="creature-name">{creature.name || 'Unnamed Creature'}</h2>
         <div class="type-line">
            {creature.size.charAt(0).toUpperCase() + creature.size.slice(1)}
            {creature.creatureType}
         </div>
      </div>
      <div class="level-display">
         <span class="level-label">Level</span>
         <span class="level-value">{creature.level}</span>
      </div>
   </div>

   {#if creature.traits.length > 0}
      <div class="traits-line">
         {#each creature.traits as trait, i (i)}
            <span class="trait">{trait}</span>
         {/each}
      </div>
   {/if}

   <div class="stats-grid">
      <div class="stat-block defense">
         <div class="stat-row">
            <span class="stat-label">AC</span>
            <span class="stat-value">{computedStats.ac}</span>
         </div>
         <div class="stat-row">
            <span class="stat-label">HP</span>
            <span class="stat-value">{computedStats.hp}</span>
         </div>
      </div>
      <div class="stat-block saves">
         <div class="stat-row">
            <span class="stat-label">Fort</span>
            <span class="stat-value">{formatStat(computedStats.fortitude)}</span>
         </div>
         <div class="stat-row">
            <span class="stat-label">Ref</span>
            <span class="stat-value">{formatStat(computedStats.reflex)}</span>
         </div>
         <div class="stat-row">
            <span class="stat-label">Will</span>
            <span class="stat-value">{formatStat(computedStats.will)}</span>
         </div>
      </div>
      <div class="stat-block offense">
         {#each creature.strikes as strike, i (i)}
            {@const computed = computeStrikeStats(creature.level, strike)}
            <div class="stat-row">
               <span class="stat-label">{strike.name}</span>
               <span class="stat-value">{formatStat(computed.attackBonus)} ({computed.damage})</span>
            </div>
         {/each}
         <div class="stat-row">
            <span class="stat-label">Perception</span>
            <span class="stat-value">{formatStat(computedStats.perception)}</span>
         </div>
      </div>
   </div>

   <div class="abilities-row">
      {#each ABILITY_SCORES as ability (ability)}
         <div class="ability">
            <span class="ability-label">{ABILITY_SCORE_LABELS[ability]}</span>
            <span class="ability-value">{formatStat(computedStats[ability])}</span>
         </div>
      {/each}
   </div>

   {#if Object.keys(computedStats.skills).length > 0}
      <div class="skills-line">
         <span class="skills-label">Skills</span>
         {#each Object.entries(computedStats.skills) as [skill, value], i (skill)}
            <span class="skill">{skill} {formatStat(value)}{i < Object.keys(computedStats.skills).length - 1 ? ',' : ''}</span>
         {/each}
      </div>
   {/if}

   {#if computedStats.spellDC !== undefined}
      <div class="spellcasting-line">
         <span class="spellcasting-label">Spellcasting</span>
         <span class="spellcasting-detail">
            {#if creature.benchmarks.spellTradition}
               {SPELL_TRADITION_LABELS[creature.benchmarks.spellTradition]}
            {/if}
            {#if creature.benchmarks.spellProgression && creature.benchmarks.spellProgression !== 'none'}
               {SPELL_PROGRESSION_LABELS[creature.benchmarks.spellProgression]}
            {/if}
            {#if creature.benchmarks.spellFont}
               ({creature.benchmarks.spellFont} font)
            {/if}
            DC {computedStats.spellDC}{#if computedStats.spellAttack !== undefined}, attack {formatStat(computedStats.spellAttack)}{/if}
         </span>
         {#if computedStats.spellSlots}
            <span class="spellcasting-slots">{formatSpellSlotSummary(computedStats.spellSlots)}</span>
         {/if}
      </div>
   {/if}
</section>

<style lang="scss">
   .statblock-card {
      background: var(--surface-low);
      border: 1px solid var(--border-primary-subtle);
      border-radius: var(--radius-xl);
      overflow: hidden;
   }

   .statblock-header {
      display: flex;
      align-items: center;
      gap: var(--space-12);
      padding: var(--space-12) var(--space-16);
      background: linear-gradient(135deg, var(--surface-primary-low), var(--surface-primary-lowest));
      border-bottom: 1px solid var(--border-primary-subtle);
   }

   .portrait-thumb {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: var(--radius-lg);
      overflow: hidden;
      border: 2px solid var(--border-primary);
      flex-shrink: 0;

      img {
         width: 100%;
         height: 100%;
         object-fit: cover;
      }
   }

   .name-section {
      flex: 1;
      min-width: 0;
   }

   .creature-name {
      margin: 0;
      color: var(--text-primary);
      font-family: var(--font-serif-rm);
      font-size: var(--font-xl);
      font-weight: var(--font-weight-bold);
      line-height: 1.2;
   }

   .type-line {
      font-size: var(--font-sm);
      color: var(--text-secondary);
      margin-top: var(--space-2);
   }

   .level-display {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: var(--surface-primary);
      border-radius: var(--radius-lg);
      padding: var(--space-8) var(--space-12);

      .level-label {
         font-size: var(--font-xs);
         color: var(--text-secondary);
         text-transform: uppercase;
      }

      .level-value {
         font-size: var(--font-2xl);
         font-weight: var(--font-weight-bold);
         color: var(--text-primary);
      }
   }

   .traits-line {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-6);
      padding: var(--space-8) var(--space-16);
      background: var(--surface-lowest);
      border-bottom: 1px solid var(--border-subtle);

      .trait {
         padding: var(--space-2) var(--space-8);
         background: var(--color-primary);
         color: white;
         font-size: var(--font-xs);
         font-weight: var(--font-weight-semibold);
         border-radius: var(--radius-sm);
         text-transform: lowercase;
      }
   }

   .stats-grid {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--space-16);
      padding: var(--space-12) var(--space-16);
      border-bottom: 1px solid var(--border-subtle);
   }

   .stat-block {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);

      &.saves {
         border-left: 1px solid var(--border-subtle);
         border-right: 1px solid var(--border-subtle);
         padding: 0 var(--space-16);
      }
   }

   .stat-row {
      display: flex;
      align-items: baseline;
      gap: var(--space-6);

      .stat-label {
         font-size: var(--font-sm);
         color: var(--text-secondary);
         font-weight: var(--font-weight-semibold);
      }

      .stat-value {
         font-size: var(--font-md);
         color: var(--text-primary);
         font-weight: var(--font-weight-bold);
      }
   }

   .abilities-row {
      display: flex;
      justify-content: space-around;
      padding: var(--space-10) var(--space-16);
      background: var(--surface-lowest);
      border-bottom: 1px solid var(--border-subtle);

      .ability {
         display: flex;
         flex-direction: column;
         align-items: center;
         gap: var(--space-2);

         .ability-label {
            font-size: var(--font-xs);
            color: var(--text-muted);
            text-transform: uppercase;
         }

         .ability-value {
            font-size: var(--font-md);
            font-weight: var(--font-weight-bold);
            color: var(--text-primary);
         }
      }
   }

   .skills-line {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      padding: var(--space-10) var(--space-16);
      font-size: var(--font-sm);
      color: var(--text-primary);

      .skills-label {
         font-weight: var(--font-weight-semibold);
         color: var(--text-secondary);
         margin-right: var(--space-4);
      }

      .skill {
         margin-right: var(--space-2);
      }
   }

   .spellcasting-line {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      padding: var(--space-6) var(--space-16);
      font-size: var(--font-sm);
      color: var(--text-primary);
      border-top: 1px solid var(--border-subtle);

      .spellcasting-label {
         font-weight: var(--font-weight-semibold);
         color: var(--text-secondary);
         margin-right: var(--space-4);
      }

      .spellcasting-detail {
         margin-right: var(--space-8);
      }

      .spellcasting-slots {
         color: var(--text-secondary);
      }
   }
</style>
