import { useEffect, useMemo } from 'react';

import { isEditableTarget } from '../input/editable-target.js';
import { createKeyboardCoordinator, type KeyboardEventLike } from '../input/keyboard-coordinator.js';
import type { MapEditorStoreApi } from './map-editor-store.js';

function isUndoShortcut(event: KeyboardEventLike): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
}

function isRedoShortcut(event: KeyboardEventLike): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z';
}

export function useMapEditorKeyboardShortcuts(store: MapEditorStoreApi | null): void {
  const keyboardCoordinator = useMemo(
    () => (typeof document === 'undefined' ? null : createKeyboardCoordinator(document)),
    [],
  );

  useEffect(() => {
    return () => {
      keyboardCoordinator?.destroy();
    };
  }, [keyboardCoordinator]);

  useEffect(() => {
    if (keyboardCoordinator === null || store === null) {
      return;
    }

    return keyboardCoordinator.register((event) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return false;
      }

      if (isUndoShortcut(event)) {
        store.getState().undo();
        return true;
      }

      if (isRedoShortcut(event)) {
        store.getState().redo();
        return true;
      }

      if (event.key === 'Escape') {
        const state = store.getState();
        state.selectZone(null);
        state.selectRoute(null);
        return true;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'g') {
        store.getState().toggleGrid();
        return true;
      }

      return false;
    }, { priority: 20 });
  }, [keyboardCoordinator, store]);
}
