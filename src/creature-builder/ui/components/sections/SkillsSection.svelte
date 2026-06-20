<script lang="ts">
  import type { EditableCreature, CreatureStats } from '@/creature-builder/editor';
  import { getStatRangesForLevel, type SkillStatRange } from '@/creature-builder/logic/creatureStatTables';
  import { SKILLS } from '@/creature-builder/editor/creatureEditorUtils';
  import BenchmarkSelector from '../widgets/BenchmarkSelector.svelte';
  import CollapsibleSection from '../widgets/CollapsibleSection.svelte';

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

  let newSkillName = $state('');
  let skillSelectRef = $state<HTMLSelectElement>();

  function handleAddSkill(): void {
    if (newSkillName.trim()) {
      onAddSkill?.(newSkillName.trim());
      newSkillName = '';
    }
  }

  function openSkillSelect(): void {
    skillSelectRef?.showPicker();
  }

  const skillLowRangeSubtext = $derived.by(() => {
    if (!creature) return undefined;
    const ranges = getStatRangesForLevel(creature.level);
    const skillRange = ranges.skills as SkillStatRange;
    return `+${skillRange.lowMin} to +${skillRange.lowMax}`;
  });
</script>

<section class="editor-section">
  <CollapsibleSection label="Skills" {expanded} ontoggle={() => onToggle?.()} />
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
          <button class="add-skill-btn" aria-label="Add skill" title="Add skill" onclick={openSkillSelect}>
            <i class="fas fa-plus"></i>
          </button>
          <select
            class="skill-add-hidden"
            bind:this={skillSelectRef}
            bind:value={newSkillName}
            onchange={handleAddSkill}
          >
            <option value="">Select skill...</option>
            {#each SKILLS.filter(s => !creature.benchmarks.skills.find(sk => sk.skill === s)) as skill (skill)}
              <option value={skill}>{skill}</option>
            {/each}
          </select>
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
      </div>
    </div>
  {/if}
</section>

<style lang="scss">
  .editor-section {
    background: var(--surface-low);
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
      display: flex;
      align-items: center;
      gap: var(--space-8);
      margin-bottom: var(--space-10);

      span {
        font-size: var(--font-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--text-secondary);
      }

      .skill-add-hidden {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
        pointer-events: none;
      }
    }
  }

  .add-skill-btn {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background: var(--surface-low);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: var(--font-xs);
    cursor: pointer;

    &:hover {
      background: var(--surface-medium);
      color: var(--text-primary);
    }
  }
</style>
