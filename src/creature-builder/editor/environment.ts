import type { SpecialAbility } from '../logic/models';
import type { CustomAbilityDefinition } from '../logic/contracts';

export interface EditorNotifier {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// The Foundry-touching UI operations the editor core delegates to its host, so editor/ and the
// presentational sections stay Foundry-free (the host wires these to ui.notifications / FilePicker /
// the ability item interop). The save target owns actor persistence; this owns everything else.
export interface EditorEnvironment {
  notify: EditorNotifier;
  /** Open an image file picker; resolves to the chosen path. Mirrors FilePicker: a cancel never resolves. */
  pickImage(current: string): Promise<string>;
  /** Parse a dropped Foundry Item payload into an ability (drag-in), or null if it isn't an action/ability. */
  abilityFromDrop(data: unknown, level: number): Promise<SpecialAbility | null>;
  /** Serialize an ability to the Foundry Item drop-payload string set on a drag-out onto an actor sheet. */
  abilityToDropPayload(ability: SpecialAbility, level: number): string;
  /** Instantiate a provider ability for the creature — the kernel mapping plus a host-assigned id. */
  abilityFromDefinition(def: CustomAbilityDefinition, level: number): SpecialAbility;
}
