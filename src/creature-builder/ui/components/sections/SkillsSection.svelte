<script lang="ts">
  import type { EditableCreature, CreatureStats } from '@/creature-builder/editor';
  import { getStatRangesForLevel, type SkillStatRange } from '@/creature-builder/logic/creatureStatTables';
  import { getSkillGroups } from '@/creature-builder/ui/vocab';
  import BenchmarkSelector from '../widgets/BenchmarkSelector.svelte';
  import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
  import TypeFilterMenu from '../widgets/TypeFilterMenu.svelte';

  let {
    creature,
    computedStats,
    expanded,
    onToggle,
    onBenchmarkSelect,
    onBenchmarkEdit,
    onAddSkill,
    onRemoveSkill,
    onUpdateSkillBenchmark
  }: {
    creature: EditableCreature;
    computedStats: CreatureStats | null;
    expanded: boolean;
    onToggle?: () => void;
    onBenchmarkSelect?: (d: { path: string; value: number }) => void;
    onBenchmarkEdit?: (d: { path: string; value: number; statType: string }) => void;
    onAddSkill?: (skill: string) => void;
    onRemoveSkill?: (skill: string) => void;
    onUpdateSkillBenchmark?: (d: { skill: string; benchmark: number }) => void;
  } = $props();

  const skillGroups = getSkillGroups();

  const skillLowRangeSubtext = $derived.by(() => {
    if (!creature) return undefined;
    const ranges = getStatRangesForLevel(creature.level);
    const skillRange = ranges.skills as SkillStatRange;
    return `+${skillRange.lowMin} to +${skillRange.lowMax}`;
  });
</script>

<section class="editor-section">
  <CollapsibleSection label="Skills" {expanded} ontoggle={() => onToggle?.()}>
    {#snippet summary()}
      <span class="sum-stat"><span class="sum-key">Per</span><strong>{computedStats?.perception !== undefined ? (computedStats.perception >= 0 ? `+${computedStats.perception}` : computedStats.perception) : '—'}</strong></span>
      {#if creature.benchmarks.skills.length}<strong>{creature.benchmarks.skills.length}</strong> skill{creature.benchmarks.skills.length === 1 ? '' : 's'}{/if}
    {/snippet}
  </CollapsibleSection>
  {#if expanded}
    <div class="section-body">
      <div class="benchmark-grid">
        <BenchmarkSelector
          label="Perception"
          value={creature.benchmarks.perception}
          computedValue={computedStats?.perception}
          onselect={(d) => onBenchmarkSelect?.({ path: 'perception', value: d.value })}
          onedit={(d) => onBenchmarkEdit?.({ path: 'perception', value: d.value, statType: 'perception' })}
        />
      </div>

      <div class="skills-editor">
        <div class="skills-header">
          <span>Skills</span>
        </div>
        {#each creature.benchmarks.skills as skill (skill.skill)}
          <BenchmarkSelector
            label={skill.skill}
            value={skill.benchmark}
            computedValue={computedStats?.skills[skill.skill]}
            benchmarks={['low', 'moderate', 'high', 'extreme']}
            use4Benchmark={true}
            subtext={skill.benchmark < 1/3 ? skillLowRangeSubtext : undefined}
            compact={true}
            showRemove={true}
            onselect={(d) => onUpdateSkillBenchmark?.({ skill: skill.skill, benchmark: d.value })}
            onedit={(d) => onBenchmarkEdit?.({ path: `skills.${skill.skill}`, value: d.value, statType: 'skill' })}
            onremove={() => onRemoveSkill?.(skill.skill)}
          />
        {/each}
        <div class="skills-add">
          <TypeFilterMenu
            variant="button"
            groups={skillGroups}
            disabledValues={creature.benchmarks.skills.map((s) => s.skill)}
            label={creature.benchmarks.skills.length ? 'add' : 'add a skill'}
            searchPlaceholder="Filter skills…"
            triggerTitle="Add a skill"
            onSelect={(value) => onAddSkill?.(value)}
          />
        </div>
      </div>
    </div>
  {/if}
</section>

<style lang="scss">
  .editor-section {
    background: var(--section-body-bg);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .section-body {
    padding: var(--space-16);
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }

  .benchmark-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  /* Skills Editor */
  .skills-editor {
    margin-top: var(--space-12);
    padding-top: var(--space-12);
    border-top: 1px solid var(--border-subtle);

    .skills-header {
      margin-bottom: var(--space-10);

      span {
        font-size: var(--font-md);
        font-weight: var(--font-weight-semibold);
        color: var(--text-secondary);
      }
    }
  }

  .skills-add {
    margin-top: var(--space-8);
  }
</style>
