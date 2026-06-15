export type ListItem = { id: string; name: string; level?: number };

export interface ListLoaderCallbacks {
  setItems(items: ListItem[]): void;
  setLoading(loading: boolean): void;
}

/**
 * Serialises list loads for a multi-source picker. A monotonic ticket lets a
 * slow async load detect that it has been superseded — by a newer load of the
 * same source or by a switch to a synchronous source — and skip its write-back.
 * Without it a stale result clobbers `items` with the wrong source's data,
 * which mis-routes any action keyed off the currently selected source.
 */
export class SourceListLoader {
  private loadId = 0;

  constructor(private readonly cb: ListLoaderCallbacks) {}

  loadSync(items: ListItem[]): void {
    this.loadId++; // supersede any in-flight async load
    this.cb.setLoading(false);
    this.cb.setItems(items);
  }

  async loadAsync(
    fetch: () => Promise<ListItem[]>,
    opts: { available: boolean; stillCurrent: () => boolean; onError?: (error: unknown) => void }
  ): Promise<void> {
    const myLoadId = ++this.loadId;
    if (!opts.available) {
      this.cb.setItems([]);
      return;
    }
    this.cb.setLoading(true);
    try {
      const items = await fetch();
      if (myLoadId !== this.loadId || !opts.stillCurrent()) return;
      this.cb.setItems(items);
    } catch (error) {
      opts.onError?.(error);
      if (myLoadId === this.loadId) this.cb.setItems([]);
    } finally {
      if (myLoadId === this.loadId) this.cb.setLoading(false);
    }
  }
}
