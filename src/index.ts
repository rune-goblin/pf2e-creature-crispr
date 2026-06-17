import './styles.css';
import './creature-builder/styles/variables.css';
import './creature-builder/styles/form-controls.css';
import './creature-builder/styles/app-shell.css';
import { MODULE_ID } from './constants';
import { CreatureCrisprApp } from './creature-builder/ui/CreatureCrisprApp';

interface ModuleApi {
  version: string;
  open: () => void;
}

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once('ready', () => {
  const module = game.modules.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ModuleApi = {
    version,
    open: () => {
      CreatureCrisprApp.open();
    }
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
  button.addEventListener('click', () => CreatureCrisprApp.open());

  const header = root.querySelector('.directory-header') ?? root;
  header.prepend(button);
});
