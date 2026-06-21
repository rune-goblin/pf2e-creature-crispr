import type { AbilityProvider } from '../logic/contracts';

// Registered ability providers, keyed by id. Populated by consumers (via the Phase 3 public API);
// the editor reads them to drive the picker. Foundry-free data, so the editor core can consume the
// resolved list through a prop without re-coupling to the host.
const providers = new Map<string, AbilityProvider>();

// Which providers the current editor launch surfaces (set by editCreature); undefined = all.
let activeFilter: string[] | undefined;

export function registerAbilityProvider(provider: AbilityProvider): void {
  providers.set(provider.id, provider);
}

/** All registered providers, or just the named ones (the editCreature provider filter). */
export function getAbilityProviders(ids?: string[]): AbilityProvider[] {
  const all = [...providers.values()];
  if (!ids) return all;
  const wanted = new Set(ids);
  return all.filter((p) => wanted.has(p.id));
}

export function setActiveProviderFilter(ids?: string[]): void {
  activeFilter = ids;
}

/** The providers the editor should surface for the active launch (honours the filter). */
export function getActiveProviders(): AbilityProvider[] {
  return getAbilityProviders(activeFilter);
}

export function clearAbilityProviders(): void {
  providers.clear();
  activeFilter = undefined;
}
