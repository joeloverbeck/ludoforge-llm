// @vitest-environment jsdom

import { createElement, type ReactElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { StoreApi } from 'zustand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { useKeyboardShortcuts } from '../../src/ui/useKeyboardShortcuts.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

interface HarnessProps {
  readonly store: StoreApi<GameStore>;
  readonly enabled?: boolean;
}

function Harness({ store, enabled = true }: HarnessProps): ReactElement {
  useKeyboardShortcuts(store, enabled);
  return createElement('div');
}

function createKeyboardStore(state: {
  readonly renderModel: GameStore['renderModel'];
  readonly selectAction?: GameStore['selectAction'];
  readonly cancelMove?: GameStore['cancelMove'];
  readonly cancelChoice?: GameStore['cancelChoice'];
  readonly confirmMove?: GameStore['confirmMove'];
  readonly undo?: GameStore['undo'];
  readonly resolveAiTurn?: GameStore['resolveAiTurn'];
}): StoreApi<GameStore> {
  return {
    getState: () => ({
      renderModel: state.renderModel,
      selectAction: state.selectAction ?? (async () => {}),
      cancelMove: state.cancelMove ?? (() => {}),
      cancelChoice: state.cancelChoice ?? (async () => {}),
      confirmMove: state.confirmMove ?? (async () => {}),
      undo: state.undo ?? (async () => {}),
      resolveAiTurn: state.resolveAiTurn ?? (async () => {}),
    }),
  } as unknown as StoreApi<GameStore>;
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    cleanup();
  });

  it('Escape dispatches cancelMove in choice modes', () => {
    const cancelMove = vi.fn();
    render(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            options: [{
              choiceValueId: 's:1:zone-a',
              value: 'zone-a',
              displayName: 'Zone A',
              target: { kind: 'scalar', entityId: null, displaySource: 'fallback' },
              legality: 'legal',
              illegalReason: null,
            }],
          },
        }),
        cancelMove,
      }),
    }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cancelMove).toHaveBeenCalledTimes(1);
  });

  it('Backspace dispatches cancelChoice in choice modes', () => {
    const cancelChoice = vi.fn(async () => {});
    render(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel({
          choiceUi: {
            kind: 'discreteOne',
            options: [{
              choiceValueId: 's:1:zone-a',
              value: 'zone-a',
              displayName: 'Zone A',
              target: { kind: 'scalar', entityId: null, displaySource: 'fallback' },
              legality: 'legal',
              illegalReason: null,
            }],
          },
        }),
        cancelChoice,
      }),
    }));

    fireEvent.keyDown(document, { key: 'Backspace' });
    expect(cancelChoice).toHaveBeenCalledTimes(1);
  });

  it('Enter dispatches confirmMove only in choiceConfirm mode', () => {
    const confirmMove = vi.fn(async () => {});
    const { rerender } = render(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel({
          choiceUi: { kind: 'confirmReady' },
        }),
        confirmMove,
      }),
    }));

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(confirmMove).toHaveBeenCalledTimes(1);

    rerender(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel({
          choiceUi: { kind: 'none' },
        }),
        confirmMove,
      }),
    }));
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(confirmMove).toHaveBeenCalledTimes(1);
  });

  it('number keys dispatch selectAction for in-bounds available actions only', () => {
    const selectAction = vi.fn(async () => {});
    render(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel({
          actionGroups: [{
            groupName: 'Core',
            actions: [
              { actionId: 'move', displayName: 'Move', isAvailable: true },
              { actionId: 'pass', displayName: 'Pass', isAvailable: false },
            ],
          }],
        }),
        selectAction,
      }),
    }));

    fireEvent.keyDown(document, { key: '1' });
    fireEvent.keyDown(document, { key: '2' });
    fireEvent.keyDown(document, { key: '9' });

    expect(selectAction).toHaveBeenCalledTimes(1);
    expect(selectAction).toHaveBeenCalledWith('move');
  });

  it('Z dispatches undo only in actions mode', () => {
    const undo = vi.fn(async () => {});
    const { rerender } = render(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel(),
        undo,
      }),
    }));

    fireEvent.keyDown(document, { key: 'z' });
    expect(undo).toHaveBeenCalledTimes(1);

    rerender(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel({ activePlayerID: asPlayerId(1) }),
        undo,
      }),
    }));
    fireEvent.keyDown(document, { key: 'z' });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('Space dispatches resolveAiTurn only in aiTurn mode', () => {
    const resolveAiTurn = vi.fn(async () => {});
    const { rerender } = render(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel({ activePlayerID: asPlayerId(1) }),
        resolveAiTurn,
      }),
    }));

    fireEvent.keyDown(document, { key: ' ' });
    expect(resolveAiTurn).toHaveBeenCalledTimes(1);

    rerender(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel({ activePlayerID: asPlayerId(0) }),
        resolveAiTurn,
      }),
    }));
    fireEvent.keyDown(document, { key: ' ' });
    expect(resolveAiTurn).toHaveBeenCalledTimes(1);
  });

  it('ignores events from form and editable targets', () => {
    const undo = vi.fn(async () => {});
    render(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel(),
        undo,
      }),
    }));

    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(input, editable);

    fireEvent.keyDown(input, { key: 'z' });
    fireEvent.keyDown(editable, { key: 'z' });
    fireEvent.keyDown(document, { key: 'z' });

    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('ignores events already marked as defaultPrevented', () => {
    const undo = vi.fn(async () => {});
    const preListener = (event: KeyboardEvent) => {
      event.preventDefault();
    };
    document.addEventListener('keydown', preListener);

    render(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel(),
        undo,
      }),
    }));

    fireEvent.keyDown(document, { key: 'z' });
    expect(undo).toHaveBeenCalledTimes(0);

    document.removeEventListener('keydown', preListener);
  });

  it('cleans up the keydown listener on unmount', () => {
    const undo = vi.fn(async () => {});
    const rendered = render(createElement(Harness, {
      store: createKeyboardStore({
        renderModel: makeRenderModel(),
        undo,
      }),
    }));

    rendered.unmount();
    fireEvent.keyDown(document, { key: 'z' });
    expect(undo).toHaveBeenCalledTimes(0);
  });
});
