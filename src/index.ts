import './styles.css';
import './creature-builder/styles/variables.css';
import './creature-builder/styles/form-controls.css';
import './creature-builder/styles/app-shell.css';
import { MODULE_ID } from './constants';
import { editCreature, openEditor, type EditCreatureOptions } from './creature-builder/editorLaunch';
import {
  registerAbilityProvider,
  registerSaveTarget,
  searchBestiary,
  importCreatureFromCompendium,
  applyTroopToActor,
  exportActorSource,
  exportActorSourceToFile,
  type BestiaryEntry,
  type BestiaryFilterOptions
} from './creature-builder/services';
import type { AbilityProvider, CreatureSaveTarget } from './creature-builder/logic/contracts';
import type { TroopSize } from './creature-builder/logic/models';

interface ModuleApi {
  version: string;
  open: () => void;
  editCreature: (opts?: EditCreatureOptions) => void;
  registerAbilityProvider: (provider: AbilityProvider) => void;
  registerSaveTarget: (target: CreatureSaveTarget) => void;
  // Dev-time creature-library flow: search → import → applyTroopToActor → export (see docs/api/README.md).
  // searchBestiary self-initializes the compendium index, so a consumer can call it cold.
  searchBestiary: (options?: BestiaryFilterOptions, limit?: number) => Promise<BestiaryEntry[]>;
  importCreatureFromCompendium: (uuid: string) => Promise<string>;
  applyTroopToActor: (actorId: string, opts?: { troopSize?: TroopSize; formUp?: boolean }) => Promise<string>;
  exportActorSource: (actorId: string) => Promise<Record<string, unknown>>;
  exportActorSourceToFile: (actorId: string) => Promise<void>;
}

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once('ready', () => {
  const module = game.modules.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ModuleApi = {
    version,
    open: openEditor,
    editCreature,
    registerAbilityProvider,
    registerSaveTarget,
    searchBestiary,
    importCreatureFromCompendium,
    applyTroopToActor,
    exportActorSource,
    exportActorSourceToFile
  };
  // `api` is the Foundry convention for a public API, but isn't a typed field on Module.
  if (module) (module as { api?: ModuleApi }).api = api;
  console.log(`${MODULE_ID} | ready (v${version})`);
});

// GM-only launch button at the top of the Actors sidebar. The public API
// `game.modules.get(MODULE_ID).api.open()` opens the same window without it.
Hooks.on('renderActorDirectory', (...args: unknown[]) => {
  if (!game.user?.isGM) return;
  const html = args[1];
  const root = html instanceof HTMLElement ? html : (html as { 0?: HTMLElement } | undefined)?.[0];
  if (!root || root.querySelector('.creature-crispr-launch')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'creature-crispr-launch';
  button.innerHTML = '<i class="fa-solid fa-dna"></i> Creature CRISPR';
  button.addEventListener('click', () => openEditor());

  const header = root.querySelector('.directory-header') ?? root;
  header.prepend(button);
});
