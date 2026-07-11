import type { DropDestination } from './environment';

// Reactive hover state for type-aware drop highlighting. The destination is classified
// asynchronously (item resolution) after dragstart, so each drag gets a sequence number:
// a resolve carrying a stale sequence (a newer drag started, or the drag ended) is discarded.
export class DragDropState {
  active = $state(false);
  destination = $state<DropDestination | null>(null);
  #seq = 0;

  begin(): number {
    this.#seq++;
    this.active = true;
    this.destination = null;
    return this.#seq;
  }

  resolve(seq: number, destination: DropDestination | null): void {
    if (seq === this.#seq && this.active) this.destination = destination;
  }

  end(): void {
    this.#seq++;
    this.active = false;
    this.destination = null;
  }
}

export const dragDropState = new DragDropState();
