import { useEffect } from 'react';
import type { StoreApi } from 'zustand';

import type { KeyboardCoordinator, KeyboardEventLike } from '../input/keyboard-coordinator.js';
import type { GameStore } from '../store/game-store.js';
import { deriveBottomBarState } from './bottom-bar-mode.js';

type SelectActionId = Parameters<GameStore['selectAction']>[0];

const SPACE_KEYS = new Set([' ', 'Space', 'Spacebar']);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return target.closest('[contenteditable]') !== null;
}

function flattenActions(renderModel: NonNullable<GameStore['renderModel']>) {
  return renderModel.actionGroups.flatMap((group) => group.actions);
}

function isChoiceMode(kind: ReturnType<typeof deriveBottomBarState>['kind']): boolean {
  return kind === 'choicePending' || kind === 'choiceConfirm' || kind === 'choiceInvalid';
}

type ShortcutKeyboardEvent = KeyboardEventLike & {
  readonly target: EventTarget | null;
};

function handleKeyboardShortcutEvent(event: ShortcutKeyboardEvent, store: StoreApi<GameStore>): boolean {
  if (event.defaultPrevented || isEditableTarget(event.target)) {
    return false;
  }

  const state = store.getState();
  const mode = deriveBottomBarState(state.renderModel);

  if (event.key === 'Escape' && isChoiceMode(mode.kind)) {
    state.cancelMove();
    return true;
  }

  if (event.key === 'Backspace' && isChoiceMode(mode.kind)) {
    void state.cancelChoice();
    return true;
  }

  if (event.key === 'Enter' && mode.kind === 'choiceConfirm') {
    void state.confirmMove();
    return true;
  }

  if (/^[1-9]$/.test(event.key) && mode.kind === 'actions' && state.renderModel !== null) {
    const flattenedActions = flattenActions(state.renderModel);
    const index = Number.parseInt(event.key, 10) - 1;
    const action = flattenedActions[index];
    if (action !== undefined && action.isAvailable) {
      void state.selectAction(action.actionId as SelectActionId);
      return true;
    }
    return false;
  }

  if (event.key.toLowerCase() === 'z' && mode.kind === 'actions') {
    void state.undo();
    return true;
  }

  if (SPACE_KEYS.has(event.key) && mode.kind === 'aiTurn') {
    void state.resolveAiTurn();
    return true;
  }

  return false;
}

export function useKeyboardShortcuts(
  store: StoreApi<GameStore>,
  enabled = true,
  keyboardCoordinator?: KeyboardCoordinator,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (keyboardCoordinator !== undefined) {
      return keyboardCoordinator.register(
        (event) => handleKeyboardShortcutEvent(event, store),
        { priority: 20 },
      );
    }

    if (typeof document === 'undefined') {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (handleKeyboardShortcutEvent(event, store)) {
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, keyboardCoordinator, store]);
}
