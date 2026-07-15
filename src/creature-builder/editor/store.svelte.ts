import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type {
  CreatureSense,
  CreatureStats,
  CreatureStrike,
  DamageModifier,
  Immunity,
  ScalableValue,
  SenseType,
  SpecialAbility,
  TroopSize
} from '../logic/models';
import {
  getDefaultBenchmarks,
  createDefaultStrike,
  createBlankAbility,
  createDefaultSense,
  CREATURE_PRESETS,
  BENCHMARK_VALUES_4
} from '../logic/models';
import {
  calculateCreatureStats,
  scaleResistanceWeakness,
  scalarToResistanceWeakness
} from '../logic/creatureStatTables';
import type { EditableCreature, EditorMode, EditorSection } from './types';
import type { EditorEnvironment } from './environment';
import { ALL_SECTIONS } from './types';

const DEFAULT_EXPANDED: EditorSection[] = ['abilities', 'defenses', 'skills', 'offense', 'spellcasting'];

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
      languages: ['common'],
      senses: [],
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

  /** Edit a creature already read off its actor by the host (services/editorHost.loadCreatureForEdit). */
  startEdit(creature: EditableCreature): void {
    this.creature = creature;
    // snapshot already deep-clones, so no extra structuredClone is needed.
    this.originalCreature = $state.snapshot(this.creature) as EditableCreature;
    this.active = true;
    this.mode = 'edit';
    this.isDirty = false;
    this.setExpanded(DEFAULT_EXPANDED);
    this.validationErrors.clear();
  }

  /** Import a creature already read off its actor by the host (services/editorHost.loadCreatureForImport). */
  startImport(creature: EditableCreature): void {
    this.creature = creature;
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
    const next = Math.max(-1, Math.min(24, level));
    this.mutateCreature((c) => {
      this.rescaleIwr(c, c.level, next);
      c.level = next;
    });
  }

  /** Resistances/weaknesses store raw numbers, not benchmarks, so unlike AC/HP/saves they don't
   *  recompute on their own — keep them in step with the level's typical range on a level change. */
  private rescaleIwr(c: EditableCreature, fromLevel: number, toLevel: number): void {
    if (fromLevel === toLevel) return;
    for (const r of c.resistances) r.value = scaleResistanceWeakness(r.value, fromLevel, toLevel);
    for (const w of c.weaknesses) w.value = scaleResistanceWeakness(w.value, fromLevel, toLevel);
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
    // Abilities and skills render side-by-side, so they toggle together —
    // collapsing one alone would stretch to its sibling's height and leave a blank gap.
    const linked: EditorSection[] =
      section === 'abilities' || section === 'skills' ? ['abilities', 'skills'] : [section];
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
    if (!this.creature?.traits.includes(trait)) return;
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

  /**
   * Shared guard for Cancel and window-close: resolves true when it's safe to drop the edit —
   * nothing unsaved, or the user confirmed the discard. The caller does the actual reset/close.
   */
  async confirmDiscardIfDirty(env: EditorEnvironment): Promise<boolean> {
    if (!this.active || !this.isDirty) return true;
    return env.confirmDiscard();
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
    if (!this.creature?.benchmarks.skills.some((s) => s.skill === skill)) return;
    this.mutateCreature((c) => {
      c.benchmarks.skills = c.benchmarks.skills.filter((s) => s.skill !== skill);
      c.baseStats = undefined;
    });
  }

  updateSkillBenchmark(skill: string, benchmark: number): void {
    if (!this.creature?.benchmarks.skills.some((s) => s.skill === skill)) return;
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

  /** Append a fully-formed strike (drop routing); addStrike stays the blank-strike path. */
  addStrikeEntry(strike: CreatureStrike): void {
    this.mutateCreature((c) => {
      c.strikes.push(strike);
    });
  }

  removeStrike(index: number): void {
    if (!this.creature || this.creature.strikes.length <= 1) return; // keep at least one
    if (index < 0 || index >= this.creature.strikes.length) return;
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

  /** Append the ability unless the same identity is already present — dropped abilities keep their
   *  source item id and picker abilities their slug, so a re-add carries the same id. Returns false
   *  when the duplicate was skipped. */
  addSpecialAbility(ability: SpecialAbility): boolean {
    if (!this.creature) return false;
    if (this.creature.specialAbilities.some((a) => a.id === ability.id)) return false;
    this.mutateCreature((c) => {
      c.specialAbilities.push(ability);
    });
    return true;
  }

  /** Append a fresh, blank action or passive for the user to fill in. */
  addBlankAbility(kind: 'action' | 'passive'): void {
    this.mutateCreature((c) => {
      c.specialAbilities.push(createBlankAbility(kind));
    });
  }

  removeSpecialAbility(index: number): void {
    if (!this.creature || index < 0 || index >= this.creature.specialAbilities.length) return;
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

  /**
   * Commit an edited description template, appending any scalable values inserted via the inline-element
   * inserter in the same edit session. The appended values' `{N}` placeholders were written into
   * `customTemplate` against the existing array length, so a plain append keeps indices aligned.
   */
  saveAbilityDescriptionTemplate(
    abilityIndex: number,
    customTemplate: string | undefined,
    appendedScalables: ScalableValue[] = []
  ): void {
    if (!this.creature || abilityIndex < 0 || abilityIndex >= this.creature.specialAbilities.length) return;
    this.mutateCreature((c) => {
      const { customDescriptionTemplate: _old, ...rest } = c.specialAbilities[abilityIndex];
      const normalized = customTemplate && customTemplate.length > 0 ? customTemplate : undefined;
      const scalableValues =
        appendedScalables.length > 0 ? [...(rest.scalableValues ?? []), ...appendedScalables] : rest.scalableValues;
      const next: SpecialAbility =
        normalized === undefined ? { ...rest } : { ...rest, customDescriptionTemplate: normalized };
      if (scalableValues) next.scalableValues = scalableValues;
      c.specialAbilities[abilityIndex] = next;
    });
  }

  // ── Resistances / weaknesses ──────────────────────────────────────────────

  addResistance(type: string, value?: number): void {
    if (!this.creature || this.creature.resistances.some((r) => r.type === type)) return;
    const v = value ?? scalarToResistanceWeakness(0.5, this.creature.level);
    this.mutateCreature((c) => {
      c.resistances.push({ type, value: v });
    });
  }

  removeResistance(index: number): void {
    if (!this.creature || index < 0 || index >= this.creature.resistances.length) return;
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

  addWeakness(type: string, value?: number): void {
    if (!this.creature || this.creature.weaknesses.some((w) => w.type === type)) return;
    const v = value ?? scalarToResistanceWeakness(0.5, this.creature.level);
    this.mutateCreature((c) => {
      c.weaknesses.push({ type, value: v });
    });
  }

  removeWeakness(index: number): void {
    if (!this.creature || index < 0 || index >= this.creature.weaknesses.length) return;
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
    if (this.creature?.immunities.some((i) => i.type === type)) return;
    this.mutateCreature((c) => {
      c.immunities.push({ type });
    });
  }

  removeImmunity(index: number): void {
    if (!this.creature || index < 0 || index >= this.creature.immunities.length) return;
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

  // ── Movement ─────────────────────────────────────────────────────────────────

  /** Set a movement speed in feet; pass undefined to remove a non-land speed (land always stays). */
  updateSpeed(type: keyof EditableCreature['speeds'], value: number | undefined): void {
    this.mutateCreature((c) => {
      if (value === undefined && type !== 'land') {
        delete c.speeds[type];
      } else {
        c.speeds = { ...c.speeds, [type]: Math.max(0, value ?? 0) };
      }
    });
  }

  // ── Languages ────────────────────────────────────────────────────────────────

  addLanguage(language: string): void {
    if (this.creature?.languages.includes(language)) return;
    this.mutateCreature((c) => {
      c.languages.push(language);
    });
  }

  removeLanguage(language: string): void {
    if (!this.creature?.languages.includes(language)) return;
    this.mutateCreature((c) => {
      c.languages = c.languages.filter((l) => l !== language);
    });
  }

  // ── Senses ─────────────────────────────────────────────────────────────────

  addSense(type: SenseType): void {
    if (this.creature?.senses.some((s) => s.type === type)) return;
    this.mutateCreature((c) => {
      c.senses.push(createDefaultSense(type));
    });
  }

  removeSense(index: number): void {
    if (!this.creature || index < 0 || index >= this.creature.senses.length) return;
    this.mutateCreature((c) => {
      c.senses.splice(index, 1);
    });
  }

  updateSense(index: number, updates: Partial<CreatureSense>): void {
    if (!this.creature || index < 0 || index >= this.creature.senses.length) return;
    this.mutateCreature((c) => {
      const sense = { ...c.senses[index], ...updates };
      // An explicit `range: undefined` clears the range (precise senses don't need one).
      if ('range' in updates && updates.range === undefined) delete sense.range;
      c.senses[index] = sense;
    });
  }

  // ── Troop ──────────────────────────────────────────────────────────────────

  setTroop(isTroop: boolean): void {
    this.mutateCreature((c) => {
      c.isTroop = isTroop;
      if (isTroop && !c.troopSize) c.troopSize = 'gargantuan';
    });
  }

  setTroopSize(size: TroopSize): void {
    this.mutateCreature((c) => {
      c.troopSize = size;
    });
  }

  /**
   * Structural half of Convert to Troop: flag + formation size + actor size, plus the provider
   * recipe's level/name tweaks. Pure — ability seeding is host-side (it needs item ids), reconciled
   * separately so the user's existing abilities survive.
   */
  convertToTroop(opts: { troopSize?: TroopSize; levelDelta?: number; nameSuffix?: string } = {}): void {
    this.mutateCreature((c) => {
      c.isTroop = true;
      c.troopSize = opts.troopSize ?? c.troopSize ?? 'gargantuan';
      c.size = c.troopSize;
      if (opts.levelDelta) {
        const next = Math.max(-1, Math.min(24, c.level + opts.levelDelta));
        this.rescaleIwr(c, c.level, next);
        c.level = next;
      }
      if (opts.nameSuffix) c.name = `${c.name}${opts.nameSuffix}`;
    });
  }
}

export const editorStore = new CreatureEditorStore();
