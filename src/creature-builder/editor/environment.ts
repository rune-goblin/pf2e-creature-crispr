import type { CreatureStrike, SpecialAbility } from '../logic/models';
import type { CustomAbilityDefinition } from '../logic/contracts';

/** The editor section a detected drop will land in — drives the hover highlight. */
export type DropDestination = 'actions' | 'passives' | 'offense';

export type DropEntity =
  | { kind: 'ability'; ability: SpecialAbility }
  | { kind: 'strike'; strike: CreatureStrike };

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
  /** Confirm discarding unsaved edits (the Cancel button / closing the window). True = discard, false = keep editing. */
  confirmDiscard(): Promise<boolean>;
  /** Open an image file picker; resolves to the chosen path. Mirrors FilePicker: a cancel never resolves. */
  pickImage(current: string): Promise<string>;
  /** Resolve a dropped Foundry Item payload into an editor entity (ability or strike), or null if unsupported. */
  entityFromDrop(data: unknown, level: number): Promise<DropEntity | null>;
  /** Serialize an ability to the Foundry Item drop-payload string set on a drag-out onto an actor sheet. */
  abilityToDropPayload(ability: SpecialAbility, level: number): string;
  /** Instantiate a provider ability for the creature — the kernel mapping plus a host-assigned id. */
  abilityFromDefinition(def: CustomAbilityDefinition, level: number): SpecialAbility;
  /** Enrich rendered markup so inline tags (@UUID/@Check/@Damage) become Foundry content links. */
  enrichHtml(html: string): Promise<string>;
}
