import type { DropDestination } from '../editor/environment';
import { classifyDropData, type ItemDropData } from './itemDropHandlers';

export interface DropDetectionHooks {
  begin(): number;
  resolve(seq: number, destination: DropDestination | null): void;
  end(): void;
}

/**
 * Sniff drag payloads so the editor can highlight the destination section during dragover, where
 * the browser hides `dataTransfer` data. Reading the payload from the dragstart event is blocked
 * twice over: a capture-phase document listener runs before the source's handler has called
 * setData, and Foundry's core DragDrop stopPropagation()s dragstart once data is set, so a
 * bubble-phase listener never fires at all (verified against v14). Instead,
 * DataTransfer.prototype.setData is patched — only while the editor is open — to record the
 * payload as the source writes it; a capture-phase dragstart listener consumes the recording in a
 * microtask, which runs after the whole dispatch (and thus the source's setData) has completed.
 * Cross-window drags never fire a local dragstart and degrade to frame-only highlighting; drop
 * routing reads the real payload on drop and is unaffected either way.
 */
export function installDropDetection(hooks: DropDetectionHooks): () => void {
  let lastPayload: string | null = null;

  const originalSetData = DataTransfer.prototype.setData;
  function patchedSetData(this: DataTransfer, format: string, data: string): void {
    if (format === 'text/plain') lastPayload = data;
    originalSetData.call(this, format, data);
  }
  DataTransfer.prototype.setData = patchedSetData;

  const onDragStart = () => {
    queueMicrotask(() => {
      const raw = lastPayload;
      lastPayload = null;
      if (!raw) return;
      let data: ItemDropData;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      // Dragging one of CRISPR's own abilities out — not an incoming drop, so no highlight.
      if (data.crisprAbilityDrag) return;
      if (data.type !== 'Item') return;
      const seq = hooks.begin();
      classifyDropData(data).then(
        (destination) => hooks.resolve(seq, destination),
        () => hooks.resolve(seq, null)
      );
    });
  };
  const onDragEnd = () => {
    lastPayload = null;
    hooks.end();
  };

  document.addEventListener('dragstart', onDragStart, true);
  document.addEventListener('dragend', onDragEnd, true);
  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    document.removeEventListener('dragstart', onDragStart, true);
    document.removeEventListener('dragend', onDragEnd, true);
    // Restore only if still ours — don't clobber a later patch by someone else.
    if (DataTransfer.prototype.setData === patchedSetData) {
      DataTransfer.prototype.setData = originalSetData;
    }
  };
}
