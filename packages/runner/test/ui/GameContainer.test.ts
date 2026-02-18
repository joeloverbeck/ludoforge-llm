import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import { asActionId, asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { GameContainer } from '../../src/ui/GameContainer.js';

interface CapturedErrorStateProps {
  readonly error: { readonly message: string };
  readonly onRetry: () => void;
}

const testDoubles = vi.hoisted(() => ({
  errorStateProps: null as CapturedErrorStateProps | null,
}));

vi.mock('../../src/canvas/GameCanvas.js', () => ({
  GameCanvas: () => createElement('div', { 'data-testid': 'game-canvas' }),
}));

vi.mock('../../src/ui/ActionToolbar.js', () => ({
  ActionToolbar: () => createElement('div', { 'data-testid': 'action-toolbar' }),
}));

vi.mock('../../src/ui/UndoControl.js', () => ({
  UndoControl: () => createElement('div', { 'data-testid': 'undo-control' }),
}));

vi.mock('../../src/ui/ChoicePanel.js', () => ({
  ChoicePanel: ({ mode }: { readonly mode: string }) => createElement('div', { 'data-testid': `choice-panel-${mode}` }),
}));

vi.mock('../../src/ui/ErrorState.js', () => ({
  ErrorState: (props: CapturedErrorStateProps) => {
    testDoubles.errorStateProps = props;
    return createElement('div', { 'data-testid': 'error-state' }, props.error.message);
  },
}));

type GameLifecycle = GameStore['gameLifecycle'];
type WorkerError = Exclude<GameStore['error'], null>;

interface MinimalContainerState {
  readonly gameLifecycle: GameLifecycle;
  readonly error: WorkerError | null;
  readonly renderModel: GameStore['renderModel'];
  readonly selectedAction: GameStore['selectedAction'];
  readonly partialMove: GameStore['partialMove'];
  clearError(): void;
}

function makeRenderModel(overrides: Partial<NonNullable<GameStore['renderModel']>> = {}): NonNullable<GameStore['renderModel']> {
  return {
    zones: [],
    adjacencies: [],
    mapSpaces: [],
    tokens: [],
    globalVars: [],
    playerVars: new Map(),
    globalMarkers: [],
    tracks: [],
    activeEffects: [],
    players: [
      {
        id: asPlayerId(0),
        displayName: 'Human',
        isHuman: true,
        isActive: true,
        isEliminated: false,
        factionId: null,
      },
      {
        id: asPlayerId(1),
        displayName: 'AI',
        isHuman: false,
        isActive: false,
        isEliminated: false,
        factionId: null,
      },
    ],
    activePlayerID: asPlayerId(0),
    turnOrder: [asPlayerId(0), asPlayerId(1)],
    turnOrderType: 'roundRobin',
    simultaneousSubmitted: [],
    interruptStack: [],
    isInInterrupt: false,
    phaseName: 'main',
    phaseDisplayName: 'Main',
    eventDecks: [],
    actionGroups: [{ groupName: 'Core', actions: [{ actionId: 'pass', displayName: 'Pass', isAvailable: true }] }],
    choiceBreadcrumb: [],
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    terminal: null,
    ...overrides,
  };
}

function createContainerStore(state: {
  readonly gameLifecycle: GameLifecycle;
  readonly error: WorkerError | null;
  readonly renderModel?: GameStore['renderModel'];
  readonly selectedAction?: GameStore['selectedAction'];
  readonly partialMove?: GameStore['partialMove'];
  readonly clearError?: () => void;
}): StoreApi<GameStore> {
  const clearError = state.clearError ?? (() => {});
  return createStore<MinimalContainerState>(() => ({
    gameLifecycle: state.gameLifecycle,
    error: state.error,
    renderModel: state.renderModel ?? null,
    selectedAction: state.selectedAction ?? null,
    partialMove: state.partialMove ?? null,
    clearError,
  })) as unknown as StoreApi<GameStore>;
}

describe('GameContainer', () => {
  it('renders LoadingState when lifecycle is idle', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'idle',
          error: null,
        }),
      }),
    );

    expect(html).toContain('Loading game...');
    expect(html).not.toContain('data-testid="game-canvas"');
    expect(html).not.toContain('data-testid="ui-overlay"');
  });

  it('renders LoadingState when lifecycle is initializing', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'initializing',
          error: null,
        }),
      }),
    );

    expect(html).toContain('Loading game...');
    expect(html).not.toContain('data-testid="game-canvas"');
    expect(html).not.toContain('data-testid="ui-overlay"');
  });

  it('renders ErrorState when error is non-null', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'init failed',
          },
        }),
      }),
    );

    expect(html).toContain('data-testid="error-state"');
    expect(html).toContain('init failed');
    expect(html).not.toContain('data-testid="game-canvas"');
    expect(html).not.toContain('data-testid="ui-overlay"');
  });

  it('renders GameCanvas and UIOverlay when lifecycle is playing', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
        }),
      }),
    );

    expect(html).toContain('data-testid="game-canvas"');
    expect(html).toContain('data-testid="ui-overlay"');
  });

  it('renders GameCanvas and UIOverlay when lifecycle is terminal', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'terminal',
          error: null,
        }),
      }),
    );

    expect(html).toContain('data-testid="game-canvas"');
    expect(html).toContain('data-testid="ui-overlay"');
  });

  it('renders actions mode branch only', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel(),
        }),
      }),
    );

    expect(html).toContain('data-testid="action-toolbar"');
    expect(html).toContain('data-testid="undo-control"');
    expect(html).not.toContain('data-testid="choice-panel-choicePending"');
    expect(html).not.toContain('data-testid="choice-panel-choiceConfirm"');
  });

  it('renders choicePending mode branch only', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              options: [{ value: 'x', displayName: 'X', legality: 'legal', illegalReason: null }],
            },
          }),
          selectedAction: asActionId('pass'),
          partialMove: { actionId: asActionId('pass'), params: {} },
        }),
      }),
    );

    expect(html).toContain('data-testid="choice-panel-choicePending"');
    expect(html).not.toContain('data-testid="action-toolbar"');
    expect(html).not.toContain('data-testid="undo-control"');
    expect(html).not.toContain('data-testid="choice-panel-choiceConfirm"');
  });

  it('renders choiceConfirm mode branch only', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            choiceUi: { kind: 'confirmReady' },
          }),
          selectedAction: asActionId('pass'),
          partialMove: { actionId: asActionId('pass'), params: {} },
        }),
      }),
    );

    expect(html).toContain('data-testid="choice-panel-choiceConfirm"');
    expect(html).not.toContain('data-testid="action-toolbar"');
    expect(html).not.toContain('data-testid="undo-control"');
    expect(html).not.toContain('data-testid="choice-panel-choicePending"');
  });

  it('renders choiceInvalid mode branch only', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            choiceUi: { kind: 'invalid', reason: 'ACTION_MOVE_MISMATCH' },
          }),
        }),
      }),
    );

    expect(html).toContain('data-testid="choice-panel-choiceInvalid"');
    expect(html).not.toContain('data-testid="action-toolbar"');
    expect(html).not.toContain('data-testid="undo-control"');
    expect(html).not.toContain('data-testid="choice-panel-choicePending"');
    expect(html).not.toContain('data-testid="choice-panel-choiceConfirm"');
  });

  it('renders no interactive branch in aiTurn mode', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            activePlayerID: asPlayerId(1),
          }),
        }),
      }),
    );

    expect(html).not.toContain('data-testid="action-toolbar"');
    expect(html).not.toContain('data-testid="undo-control"');
    expect(html).not.toContain('data-testid="choice-panel-choicePending"');
    expect(html).not.toContain('data-testid="choice-panel-choiceConfirm"');
  });

  it('ErrorState retry callback calls clearError on the store', () => {
    testDoubles.errorStateProps = null;
    const clearError = vi.fn();

    renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'retry me',
          },
          clearError,
        }),
      }),
    );

    const capturedErrorStateProps = testDoubles.errorStateProps as CapturedErrorStateProps | null;
    expect(capturedErrorStateProps).not.toBeNull();
    if (capturedErrorStateProps === null) {
      throw new Error('Expected ErrorState props to be captured.');
    }

    capturedErrorStateProps.onRetry();
    expect(clearError).toHaveBeenCalledTimes(1);
  });
});
