// The kernel's public surface. ReignMaker vendors this folder (as src/vendor/crispr-logic)
// and consumes the creature math through this barrel — keep everything reachable Foundry-free
// (enforced by logicPurity.test.ts).
export * from './models';
export * from './creatureStatTables';
export * from './spellSlotTables';
export * from './iwrTypes';
export * from './abilityScaling';

// Defined identically in creatureStatTables and abilityScaling; name one explicitly so the
// star-exports above don't resolve it ambiguously.
export { parseDiceFormulaAverage } from './abilityScaling';
