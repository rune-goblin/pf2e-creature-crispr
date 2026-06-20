import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { NPCPF2e } from 'foundry-pf2e';
import type {
  CreatureBenchmarks,
  CreatureSpeeds,
  CreatureStats,
  CreatureStrike,
  DamageModifier,
  Immunity,
  SpecialAbility
} from '../logic/models';
import { getDefaultBenchmarks, createDefaultStrike, CREATURE_PRESETS, BENCHMARK_VALUES_4 } from '../logic/models';
import { calculateCreatureStats, analyzeStatsForBenchmarks } from '../logic/creatureStatTables';
import {
  getCreatureData,
  getStrikesFromActor,
  getSpecialAbilitiesFromActor,
  getResistancesFromActor,
  getWeaknessesFromActor,
  getImmunitiesFromActor,
  readActorStatsAndBenchmarks,
  deriveBenchmarksFromActor
} from '../services';
import type { EditableCreature, EditorMode, EditorSection } from './types';
import { ALL_SECTIONS } from './types';

const DEFAULT_EXPANDED: EditorSection[] = ['abilities', 'defenses', 'skills', 'offense', 'spellcasting'];

/** `system.attributes.speed` isn't on the prepared NPC type; read it through a narrow view of just the movement fields. */
type ActorSpeedView = { speed?: { value?: number; otherSpeeds?: Array<{ type?: string; value?: number }> } };

function getSpeedsFromActor(actor: NPCPF2e | null | undefined): CreatureSpeeds {
  const speed = (actor?.system?.attributes as ActorSpeedView | undefined)?.speed;
  const speeds: CreatureSpeeds = { land: speed?.value ?? 25 };
  for (const other of speed?.otherSpeeds ?? []) {
    if (other.type && other.value != null) {
      (speeds as unknown as Record<string, number>)[other.type] = other.value;
    }
  }
  return speeds;
}

class CreatureEditorStore {
  active = $state(false);
  mode = $state<EditorMode>('create');
  creature = $state<EditableCreature | null>(null);
  originalCreature = $state<EditableCreature | null>(null);
  isDirty = $state(false);

  // Plain Set/Map mutations are invisible to runes — these reactive collections aren't.
  readonly expandedSections = new SvelteSet<EditorSection>(DEFAULT_EXPANDED);
  readonly validationErrors = new SvelteMap<string, string>();

  /**
   * Live computed stats. Returns canonical baseStats when the level matches baseLevel,
   * otherwise scales from benchmarks. $derived.by keeps it reactive to any creature edit.
   */
  readonly computedStats = $derived.by<CreatureStats | null>(() => {
    const c = this.creature;
    if (!c) return null;
    if (c.baseStats && c.baseLevel !== undefined && c.level === c.baseLevel) {
      return c.baseStats;
    }
    return calculateCreatureStats(c.level, c.benchmarks);
  });

  /** Mutate the current creature in place and mark dirty (replaces the spread-update boilerplate). */
  private mutateCreature(fn: (creature: EditableCreature) => void): void {
    if (!this.creature) return;
    fn(this.creature);
    this.isDirty = true;
  }

  private setExpanded(sections: EditorSection[]): void {
    this.expandedSections.clear();
    for (const s of sections) this.expandedSections.add(s);
  }

  isSectionExpanded(section: EditorSection): boolean {
    return this.expandedSections.has(section);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  startCreate(): void {
    this.creature = {
      name: 'New Creature',
      level: 1,
      creatureType: 'creature',
      size: 'medium',
      traits: [],
      benchmarks: getDefaultBenchmarks(),
      speeds: { land: 25 },
      strikes: [createDefaultStrike('Melee Strike')],
      specialAbilities: [],
      immunities: [],
      resistances: [],
      weaknesses: []
    };
    this.originalCreature = null;
    this.active = true;
    this.mode = 'create';
    this.isDirty = false;
    this.setExpanded(DEFAULT_EXPANDED);
    this.validationErrors.clear();
  }

  startEditActor(actorId: string): void {
    const actor = game.actors?.get(actorId) as NPCPF2e | undefined;
    if (!actor) {
      console.error('[CreatureEditor] Actor not found:', actorId);
      return;
    }

    const level = actor.system?.details?.level?.value ?? 1;

    // Flagged creatures keep their stored benchmarks/baseStats verbatim. Actors without the
    // flag back-solve from live stats, so editing them never resets their real numbers.
    const creatureData = getCreatureData(actorId);
    const fromActor = creatureData ? undefined : readActorStatsAndBenchmarks(actor, level);
    const benchmarks = creatureData?.benchmarks ?? fromActor?.benchmarks ?? deriveBenchmarksFromActor(actor, level);
    const baseLevel = creatureData ? creatureData.baseLevel : level;
    const baseStats = creatureData ? creatureData.baseStats : fromActor!.baseStats;

    this.creature = {
      actorId,
      name: actor.name || 'Unknown',
      level,
      creatureType: (actor.system?.details as { creatureType?: string }).creatureType || 'creature',
      size: actor.system?.traits?.size?.value || 'medium',
      traits: actor.system?.traits?.value || [],
      benchmarks,
      baseLevel,
      baseStats,
      strikes: getStrikesFromActor(actorId),
      specialAbilities: getSpecialAbilitiesFromActor(actorId),
      immunities: getImmunitiesFromActor(actorId),
      resistances: getResistancesFromActor(actorId),
      weaknesses: getWeaknessesFromActor(actorId),
      speeds: getSpeedsFromActor(actor),
      portraitImage: actor.img,
      tokenImage: actor.prototypeToken?.texture?.src ?? undefined,
      importedFrom: creatureData?.importedFrom
    };
    // snapshot already deep-clones, so no extra structuredClone is needed.
    this.originalCreature = $state.snapshot(this.creature) as EditableCreature;
    this.active = true;
    this.mode = 'edit';
    this.isDirty = false;
    this.setExpanded(DEFAULT_EXPANDED);
    this.validationErrors.clear();
  }

  startImport(
    actorId: string,
    actorData: {
      name: string;
      level: number;
      stats: Partial<CreatureStats>;
      traits?: string[];
      size?: string;
      type?: string;
    }
  ): void {
    const analyzed = analyzeStatsForBenchmarks(actorData.level, actorData.stats);
    const defaults = getDefaultBenchmarks();
    const benchmarks: CreatureBenchmarks = {
      ...defaults,
      ...analyzed,
      abilities: { ...defaults.abilities, ...(analyzed.abilities || {}) },
      saves: { ...defaults.saves, ...(analyzed.saves || {}) }
    };

    this.creature = {
      actorId,
      name: actorData.name,
      level: actorData.level,
      creatureType: actorData.type || 'creature',
      size: actorData.size || 'medium',
      traits: actorData.traits || [],
      benchmarks,
      strikes: getStrikesFromActor(actorId),
      specialAbilities: getSpecialAbilitiesFromActor(actorId),
      immunities: getImmunitiesFromActor(actorId),
      resistances: getResistancesFromActor(actorId),
      weaknesses: getWeaknessesFromActor(actorId),
      speeds: getSpeedsFromActor(game.actors?.get(actorId) as NPCPF2e | undefined),
      importedFrom: actorData.name
    };
    this.originalCreature = null;
    this.active = true;
    this.mode = 'import';
    this.isDirty = true;
    this.setExpanded(['abilities', 'defenses', 'offense', 'summary']);
    this.validationErrors.clear();
  }

  updateCreature(updates: Partial<EditableCreature>): void {
    this.mutateCreature((c) => Object.assign(c, updates));
  }

  updateLevel(level: number): void {
    this.updateCreature({ level: Math.max(-1, Math.min(24, level)) });
  }

  /**
   * Replace benchmarks with the baseline + preset overlay (so switching presets never
   * leaks fields from a prior one). User-authored skills survive — they're orthogonal.
   */
  applyRolePreset(presetKey: string): void {
    const preset = CREATURE_PRESETS[presetKey];
    if (!preset || !this.creature) return;
    this.mutateCreature((c) => {
      const defaults = getDefaultBenchmarks();
      c.benchmarks = {
        ...defaults,
        ...preset.benchmarks,
        abilities: { ...defaults.abilities, ...(preset.benchmarks.abilities || {}) },
        saves: { ...defaults.saves, ...(preset.benchmarks.saves || {}) },
        skills: c.benchmarks.skills
      };
      if (preset.baseSpeed !== undefined) {
        c.speeds = { ...c.speeds, land: preset.baseSpeed };
      }
    });
  }

  // ── Sections ───────────────────────────────────────────────────────────

  toggleSection(section: EditorSection): void {
    // Abilities and defenses render side-by-side, so they toggle together.
    const linked: EditorSection[] =
      section === 'abilities' || section === 'defenses' ? ['abilities', 'defenses'] : [section];
    const isExpanded = this.expandedSections.has(section);
    for (const s of linked) {
      if (isExpanded) this.expandedSections.delete(s);
      else this.expandedSections.add(s);
    }
  }

  expandAllSections(): void {
    this.setExpanded(ALL_SECTIONS);
  }

  collapseAllSections(): void {
    this.expandedSections.clear();
  }

  // ── Traits ─────────────────────────────────────────────────────────────

  addTrait(trait: string): void {
    if (!this.creature || this.creature.traits.includes(trait)) return;
    this.mutateCreature((c) => {
      c.traits.push(trait);
    });
  }

  removeTrait(trait: string): void {
    this.mutateCreature((c) => {
      c.traits = c.traits.filter((t) => t !== trait);
    });
  }

  // ── Validation / save ──────────────────────────────────────────────────

  validate(): boolean {
    if (!this.creature) return false;
    this.validationErrors.clear();
    if (!this.creature.name.trim()) this.validationErrors.set('name', 'Name is required');
    if (this.creature.level < -1 || this.creature.level > 24) {
      this.validationErrors.set('level', 'Level must be between -1 and 24');
    }
    return this.validationErrors.size === 0;
  }

  getCreatureForSave(): EditableCreature | null {
    return this.validate() ? this.creature : null;
  }

  cancelEdit(): void {
    this.reset();
  }

  resetEditor(): void {
    this.reset();
  }

  private reset(): void {
    this.active = false;
    this.mode = 'create';
    this.creature = null;
    this.originalCreature = null;
    this.isDirty = false;
    this.setExpanded(DEFAULT_EXPANDED);
    this.validationErrors.clear();
  }

  // ── Benchmarks / skills ──────────────────────────────────────────────────

  /** path is dot-notation: "ac", "abilities.str", "saves.fortitude". Clears baseStats. */
  updateBenchmark(path: string, value: number | string | undefined): void {
    this.mutateCreature((c) => {
      const parts = path.split('.');
      const b = c.benchmarks as any;
      if (parts.length === 1) {
        b[parts[0]] = value;
      } else if (parts[0] === 'abilities') {
        b.abilities = { ...b.abilities, [parts[1]]: value };
      } else if (parts[0] === 'saves') {
        b.saves = { ...b.saves, [parts[1]]: value };
      }
      c.baseStats = undefined;
    });
  }

  addSkill(skill: string, benchmark: number = BENCHMARK_VALUES_4.moderate): void {
    this.mutateCreature((c) => {
      const skills = c.benchmarks.skills;
      const i = skills.findIndex((s) => s.skill === skill);
      if (i >= 0) skills[i] = { skill, benchmark };
      else skills.push({ skill, benchmark });
      c.baseStats = undefined;
    });
  }

  removeSkill(skill: string): void {
    this.mutateCreature((c) => {
      c.benchmarks.skills = c.benchmarks.skills.filter((s) => s.skill !== skill);
      c.baseStats = undefined;
    });
  }

  updateSkillBenchmark(skill: string, benchmark: number): void {
    this.mutateCreature((c) => {
      c.benchmarks.skills = c.benchmarks.skills.map((s) => (s.skill === skill ? { ...s, benchmark } : s));
      c.baseStats = undefined;
    });
  }

  setSpellSlotOverride(rank: number, count: number): void {
    this.mutateCreature((c) => {
      const overrides = { ...(c.benchmarks.spellSlotOverrides ?? {}) };
      overrides[rank] = Math.max(0, count);
      c.benchmarks.spellSlotOverrides = overrides;
      c.baseStats = undefined;
    });
  }

  resetSpellSlotOverride(rank: number): void {
    const existing = this.creature?.benchmarks.spellSlotOverrides;
    if (!existing || existing[rank] === undefined) return;
    this.mutateCreature((c) => {
      const overrides = { ...existing };
      delete overrides[rank];
      c.benchmarks.spellSlotOverrides = Object.keys(overrides).length > 0 ? overrides : undefined;
      c.baseStats = undefined;
    });
  }

  // ── Strikes ──────────────────────────────────────────────────────────────

  addStrike(name: string = 'New Strike'): void {
    this.mutateCreature((c) => {
      c.strikes.push(createDefaultStrike(name));
    });
  }

  removeStrike(index: number): void {
    if (!this.creature || this.creature.strikes.length <= 1) return; // keep at least one
    this.mutateCreature((c) => {
      c.strikes.splice(index, 1);
    });
  }

  /** Properties set to undefined in updates are deleted from the strike, not left undefined. */
  updateStrike(index: number, updates: Partial<CreatureStrike>): void {
    if (!this.creature || index < 0 || index >= this.creature.strikes.length) return;
    this.mutateCreature((c) => {
      const strike = { ...c.strikes[index], ...updates } as any;
      for (const key of Object.keys(updates) as Array<keyof CreatureStrike>) {
        if (updates[key] === undefined) delete strike[key];
      }
      c.strikes[index] = strike;
    });
  }

  updateStrikeAttackBenchmark(index: number, benchmark: number): void {
    this.updateStrike(index, { attackBenchmark: benchmark });
  }

  updateStrikeDamageBenchmark(index: number, benchmark: number): void {
    this.updateStrike(index, { damageBenchmark: benchmark });
  }

  updateStrikePersistentBenchmark(index: number, benchmark: number): void {
    this.updateStrike(index, { persistentBenchmark: benchmark, customPersistentFormula: undefined });
  }

  updateStrikePersistentType(index: number, type: string): void {
    this.updateStrike(index, { persistentDamageType: type });
  }

  setStrikeCustomPersistentFormula(index: number, formula: string): void {
    this.updateStrike(index, { customPersistentFormula: formula });
  }

  clearStrikePersistent(index: number): void {
    this.updateStrike(index, {
      persistentBenchmark: undefined,
      persistentDamage: undefined,
      customPersistentFormula: undefined,
      persistentDamageType: undefined
    });
  }

  // ── Special abilities ────────────────────────────────────────────────────

  addSpecialAbility(ability: SpecialAbility): void {
    this.mutateCreature((c) => {
      c.specialAbilities.push(ability);
    });
  }

  removeSpecialAbility(index: number): void {
    this.mutateCreature((c) => {
      c.specialAbilities.splice(index, 1);
    });
  }

  updateSpecialAbility(index: number, updates: Partial<SpecialAbility>): void {
    if (!this.creature || index < 0 || index >= this.creature.specialAbilities.length) return;
    this.mutateCreature((c) => {
      c.specialAbilities[index] = { ...c.specialAbilities[index], ...updates };
    });
  }

  /** Pass undefined to clear both override and customValue (tier stepping discards fine edits). */
  updateAbilityScalableOverride(abilityIndex: number, valueIndex: number, override: number | undefined): void {
    const ability = this.creature?.specialAbilities[abilityIndex];
    if (!ability?.scalableValues || valueIndex < 0 || valueIndex >= ability.scalableValues.length) return;
    this.mutateCreature((c) => {
      const values = [...c.specialAbilities[abilityIndex].scalableValues!];
      const { override: _o, customValue: _c, ...rest } = values[valueIndex];
      values[valueIndex] = override === undefined ? rest : { ...rest, override };
      c.specialAbilities[abilityIndex] = { ...c.specialAbilities[abilityIndex], scalableValues: values };
    });
  }

  /** customValue (raw formula/int string) takes precedence over any tier override; pass undefined to clear it only. */
  updateAbilityScalableCustomValue(abilityIndex: number, valueIndex: number, customValue: string | undefined): void {
    const ability = this.creature?.specialAbilities[abilityIndex];
    if (!ability?.scalableValues || valueIndex < 0 || valueIndex >= ability.scalableValues.length) return;
    this.mutateCreature((c) => {
      const values = [...c.specialAbilities[abilityIndex].scalableValues!];
      const { customValue: _c, ...rest } = values[valueIndex];
      const normalized = customValue && customValue.length > 0 ? customValue : undefined;
      values[valueIndex] = normalized === undefined ? rest : { ...rest, customValue: normalized };
      c.specialAbilities[abilityIndex] = { ...c.specialAbilities[abilityIndex], scalableValues: values };
    });
  }

  /** Free-text template override; keeps {0},{1}… placeholders. Empty/undefined reverts to parsed template. */
  updateAbilityCustomDescriptionTemplate(abilityIndex: number, customTemplate: string | undefined): void {
    if (!this.creature || abilityIndex < 0 || abilityIndex >= this.creature.specialAbilities.length) return;
    this.mutateCreature((c) => {
      const { customDescriptionTemplate: _old, ...rest } = c.specialAbilities[abilityIndex];
      const normalized = customTemplate && customTemplate.length > 0 ? customTemplate : undefined;
      c.specialAbilities[abilityIndex] =
        normalized === undefined ? rest : { ...rest, customDescriptionTemplate: normalized };
    });
  }

  // ── Resistances / weaknesses ──────────────────────────────────────────────

  addResistance(type: string, value: number = 5): void {
    this.mutateCreature((c) => {
      if (c.resistances.some((r) => r.type === type)) return;
      c.resistances.push({ type, value });
    });
  }

  removeResistance(index: number): void {
    this.mutateCreature((c) => {
      c.resistances.splice(index, 1);
    });
  }

  updateResistance(index: number, updates: Partial<DamageModifier>): void {
    if (!this.creature || index < 0 || index >= this.creature.resistances.length) return;
    this.mutateCreature((c) => {
      c.resistances[index] = { ...c.resistances[index], ...updates };
    });
  }

  addWeakness(type: string, value: number = 5): void {
    this.mutateCreature((c) => {
      if (c.weaknesses.some((w) => w.type === type)) return;
      c.weaknesses.push({ type, value });
    });
  }

  removeWeakness(index: number): void {
    this.mutateCreature((c) => {
      c.weaknesses.splice(index, 1);
    });
  }

  updateWeakness(index: number, updates: Partial<DamageModifier>): void {
    if (!this.creature || index < 0 || index >= this.creature.weaknesses.length) return;
    this.mutateCreature((c) => {
      c.weaknesses[index] = { ...c.weaknesses[index], ...updates };
    });
  }

  // ── Immunities ─────────────────────────────────────────────────────────────

  addImmunity(type: string): void {
    this.mutateCreature((c) => {
      if (c.immunities.some((i) => i.type === type)) return;
      c.immunities.push({ type });
    });
  }

  removeImmunity(index: number): void {
    this.mutateCreature((c) => {
      c.immunities.splice(index, 1);
    });
  }

  updateImmunity(index: number, updates: Partial<Immunity>): void {
    if (!this.creature || index < 0 || index >= this.creature.immunities.length) return;
    this.mutateCreature((c) => {
      c.immunities[index] = { ...c.immunities[index], ...updates };
    });
  }
}

export const editorStore = new CreatureEditorStore();
