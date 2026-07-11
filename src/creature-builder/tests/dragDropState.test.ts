import { describe, it, expect } from 'vitest';
import { DragDropState } from '@/creature-builder/editor/dragDropState.svelte';

describe('DragDropState', () => {
  it('begin activates with no destination; resolve fills it in', () => {
    const state = new DragDropState();
    expect(state.active).toBe(false);

    const seq = state.begin();
    expect(state.active).toBe(true);
    expect(state.destination).toBeNull();

    state.resolve(seq, 'offense');
    expect(state.destination).toBe('offense');
  });

  it('end deactivates and clears the destination', () => {
    const state = new DragDropState();
    const seq = state.begin();
    state.resolve(seq, 'actions');
    state.end();
    expect(state.active).toBe(false);
    expect(state.destination).toBeNull();
  });

  it('ignores a resolve from a superseded drag', () => {
    const state = new DragDropState();
    const stale = state.begin();
    const current = state.begin();
    state.resolve(stale, 'passives');
    expect(state.destination).toBeNull();
    state.resolve(current, 'actions');
    expect(state.destination).toBe('actions');
  });

  it('ignores a resolve arriving after the drag ended', () => {
    const state = new DragDropState();
    const seq = state.begin();
    state.end();
    state.resolve(seq, 'offense');
    expect(state.active).toBe(false);
    expect(state.destination).toBeNull();
  });
});
