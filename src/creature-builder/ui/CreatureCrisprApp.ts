import { mount, unmount } from 'svelte';
import CreatureWorkspace from './components/CreatureWorkspace.svelte';

const { ApplicationV2 } = foundry.applications.api;

export class CreatureCrisprApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: 'pf2e-creature-crispr-builder',
    tag: 'section',
    classes: ['pf2e-creature-crispr'],
    window: { title: 'pf2e-creature-crispr.title', icon: 'fa-solid fa-dna', resizable: true },
    position: { width: 900, height: 800 as const },
  };

  #component?: ReturnType<typeof mount>;
  #root?: HTMLElement;

  static open(): CreatureCrisprApp {
    const app = new CreatureCrisprApp();
    app.render({ force: true });
    return app;
  }

  // AppV2 runs _renderHTML on every render; mount once and reuse the node so a re-render
  // neither leaks a second component nor discards Svelte's reactive state.
  protected override async _renderHTML(): Promise<HTMLElement> {
    if (!this.#component) {
      this.#root = document.createElement('div');
      this.#component = mount(CreatureWorkspace, { target: this.#root, props: { app: this } });
    }
    return this.#root!;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  protected override async _preClose(): Promise<void> {
    if (this.#component) {
      unmount(this.#component);
      this.#component = undefined;
      this.#root = undefined;
    }
  }
}
