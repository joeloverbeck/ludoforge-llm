import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import { asActionId, asPlayerId } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import { GameContainer, resolveTooltipAnchorState } from '../../src/ui/GameContainer.js';

interface CapturedErrorStateProps {
  readonly error: { readonly message: string };
  readonly onRetry: () => void;
}

interface CapturedTooltipLayerProps {
  readonly hoverTarget: { readonly kind: 'zone' | 'token'; readonly id: string } | null;
  readonly anchorRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

interface CapturedGameCanvasProps {
  readonly onHoverAnchorChange?: (anchor: {
    readonly target: { readonly kind: 'zone' | 'token'; readonly id: string };
    readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly space: 'world' | 'screen';
    readonly version: number;
  } | null) => void;
}

const testDoubles = vi.hoisted(() => ({
  errorStateProps: null as CapturedErrorStateProps | null,
  tooltipLayerProps: null as CapturedTooltipLayerProps | null,
  gameCanvasProps: null as CapturedGameCanvasProps | null,
}));

vi.mock('../../src/canvas/GameCanvas.js', () => ({
  GameCanvas: (props: CapturedGameCanvasProps) => {
    testDoubles.gameCanvasProps = props;
    return createElement('div', { 'data-testid': 'game-canvas' });
  },
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

vi.mock('../../src/ui/AITurnOverlay.js', () => ({
  AITurnOverlay: () => createElement('div', { 'data-testid': 'ai-turn-overlay' }),
}));

vi.mock('../../src/ui/PhaseIndicator.js', () => ({
  PhaseIndicator: () => createElement('div', { 'data-testid': 'phase-indicator' }),
}));

vi.mock('../../src/ui/TurnOrderDisplay.js', () => ({
  TurnOrderDisplay: () => createElement('div', { 'data-testid': 'turn-order-display' }),
}));

vi.mock('../../src/ui/EventDeckPanel.js', () => ({
  EventDeckPanel: () => createElement('div', { 'data-testid': 'event-deck-panel' }),
}));

vi.mock('../../src/ui/AnimationControls.js', () => ({
  AnimationControls: () => createElement('div', { 'data-testid': 'animation-controls' }),
}));

vi.mock('../../src/ui/InterruptBanner.js', () => ({
  InterruptBanner: () => createElement('div', { 'data-testid': 'interrupt-banner' }),
}));

vi.mock('../../src/ui/VariablesPanel.js', () => ({
  VariablesPanel: () => createElement('div', { 'data-testid': 'variables-panel' }),
}));

vi.mock('../../src/ui/Scoreboard.js', () => ({
  Scoreboard: () => createElement('div', { 'data-testid': 'scoreboard' }),
}));

vi.mock('../../src/ui/GlobalMarkersBar.js', () => ({
  GlobalMarkersBar: () => createElement('div', { 'data-testid': 'global-markers-bar' }),
}));

vi.mock('../../src/ui/ActiveEffectsPanel.js', () => ({
  ActiveEffectsPanel: () => createElement('div', { 'data-testid': 'active-effects-panel' }),
}));

vi.mock('../../src/ui/PlayerHandPanel.js', () => ({
  PlayerHandPanel: () => createElement('div', { 'data-testid': 'player-hand-panel' }),
}));

vi.mock('../../src/ui/WarningsToast.js', () => ({
  WarningsToast: () => createElement('div', { 'data-testid': 'warnings-toast' }),
}));

vi.mock('../../src/ui/TerminalOverlay.js', () => ({
  TerminalOverlay: () => createElement('div', { 'data-testid': 'terminal-overlay' }),
}));

vi.mock('../../src/ui/TooltipLayer.js', () => ({
  TooltipLayer: (props: CapturedTooltipLayerProps) => {
    testDoubles.tooltipLayerProps = props;
    return createElement('div', { 'data-testid': 'tooltip-layer' });
  },
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
  readonly gameDef: GameStore['gameDef'];
  readonly renderModel: GameStore['renderModel'];
  readonly selectedAction: GameStore['selectedAction'];
  readonly partialMove: GameStore['partialMove'];
  clearError(): void;
}

function makeRenderModel(overrides: Partial<NonNullable<GameStore['renderModel']>> = {}): NonNullable<GameStore['renderModel']> {
  return {
    zones: [],
    adjacencies: [],
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
  readonly gameDef?: GameStore['gameDef'];
  readonly renderModel?: GameStore['renderModel'];
  readonly selectedAction?: GameStore['selectedAction'];
  readonly partialMove?: GameStore['partialMove'];
  readonly clearError?: () => void;
}): StoreApi<GameStore> {
  const clearError = state.clearError ?? (() => {});
  return createStore<MinimalContainerState>(() => ({
    gameLifecycle: state.gameLifecycle,
    error: state.error,
    gameDef: state.gameDef ?? null,
    renderModel: state.renderModel ?? null,
    selectedAction: state.selectedAction ?? null,
    partialMove: state.partialMove ?? null,
    clearError,
  })) as unknown as StoreApi<GameStore>;
}

describe('GameContainer', () => {
  function expectAppearsInOrder(html: string, orderedTestIds: readonly string[]): void {
    let previousPosition = -1;
    for (const testId of orderedTestIds) {
      const token = `data-testid="${testId}"`;
      const currentPosition = html.indexOf(token);
      expect(currentPosition).toBeGreaterThan(-1);
      expect(currentPosition).toBeGreaterThan(previousPosition);
      previousPosition = currentPosition;
    }
  }

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
    testDoubles.tooltipLayerProps = null;
    testDoubles.gameCanvasProps = null;
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
    expect(html).toContain('data-testid="interrupt-banner"');
    expect(html).toContain('data-testid="phase-indicator"');
    expect(html).toContain('data-testid="turn-order-display"');
    expect(html).toContain('data-testid="event-deck-panel"');
    expect(html).toContain('data-testid="animation-controls"');
    expect(html).toContain('data-testid="variables-panel"');
    expect(html).toContain('data-testid="scoreboard"');
    expect(html).toContain('data-testid="global-markers-bar"');
    expect(html).toContain('data-testid="active-effects-panel"');
    expect(html).toContain('data-testid="warnings-toast"');
    expect(html).toContain('data-testid="player-hand-panel"');
    expect(html).toContain('data-testid="terminal-overlay"');
    expect(html).toContain('data-testid="tooltip-layer"');
    expectAppearsInOrder(html, [
      'interrupt-banner',
      'phase-indicator',
      'turn-order-display',
      'event-deck-panel',
      'animation-controls',
    ]);
    expectAppearsInOrder(html, [
      'variables-panel',
      'scoreboard',
      'global-markers-bar',
      'active-effects-panel',
    ]);
    expect(testDoubles.tooltipLayerProps).toMatchObject({
      hoverTarget: null,
      anchorRect: null,
    });
    const gameCanvasProps = testDoubles.gameCanvasProps as CapturedGameCanvasProps | null;
    expect(gameCanvasProps).not.toBeNull();
    if (gameCanvasProps === null) {
      throw new Error('Expected GameCanvas props to be captured.');
    }
    expect(gameCanvasProps.onHoverAnchorChange).toEqual(expect.any(Function));
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
    expect(html).toContain('data-testid="interrupt-banner"');
    expect(html).toContain('data-testid="phase-indicator"');
    expect(html).toContain('data-testid="turn-order-display"');
    expect(html).toContain('data-testid="event-deck-panel"');
    expect(html).toContain('data-testid="animation-controls"');
    expect(html).toContain('data-testid="variables-panel"');
    expect(html).toContain('data-testid="scoreboard"');
    expect(html).toContain('data-testid="global-markers-bar"');
    expect(html).toContain('data-testid="active-effects-panel"');
    expect(html).toContain('data-testid="player-hand-panel"');
    expect(html).toContain('data-testid="terminal-overlay"');
    expectAppearsInOrder(html, [
      'interrupt-banner',
      'phase-indicator',
      'turn-order-display',
      'event-deck-panel',
      'animation-controls',
    ]);
    expectAppearsInOrder(html, [
      'variables-panel',
      'scoreboard',
      'global-markers-bar',
      'active-effects-panel',
    ]);
  });

  it('exposes faction CSS variables from gameDef factions on container root', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          gameDef: {
            factions: [
              { id: 'us', color: '#e63946', displayName: 'United States' },
              { id: 'nva force', color: '#2a9d8f', displayName: 'NVA' },
            ],
          } as unknown as GameStore['gameDef'],
        }),
      }),
    );

    expect(html).toContain('--faction-us:#e63946');
    expect(html).toContain('--faction-nva-force:#2a9d8f');
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
              options: [{
                choiceValueId: 's:1:x',
                value: 'x',
                displayName: 'X',
                target: { kind: 'scalar', entityId: null, displaySource: 'fallback' },
                legality: 'legal',
                illegalReason: null,
              }],
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

  it('renders aiTurn branch only', () => {
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
    expect(html).toContain('data-testid="ai-turn-overlay"');
  });

  it('keeps aiTurn precedence even with contradictory choice/confirm state', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            activePlayerID: asPlayerId(1),
            choiceUi: { kind: 'confirmReady' },
          }),
          selectedAction: asActionId('pass'),
          partialMove: { actionId: asActionId('pass'), params: {} },
        }),
      }),
    );

    expect(html).not.toContain('data-testid="action-toolbar"');
    expect(html).not.toContain('data-testid="undo-control"');
    expect(html).not.toContain('data-testid="choice-panel-choicePending"');
    expect(html).not.toContain('data-testid="choice-panel-choiceConfirm"');
    expect(html).not.toContain('data-testid="choice-panel-choiceInvalid"');
    expect(html).toContain('data-testid="ai-turn-overlay"');
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

  it('maps only screen-space anchors into tooltip state', () => {
    expect(resolveTooltipAnchorState(null)).toEqual({
      hoverTarget: null,
      anchorRect: null,
    });

    expect(resolveTooltipAnchorState({
      target: { kind: 'zone', id: 'zone:a' },
      rect: { x: 10, y: 20, width: 100, height: 40 },
      space: 'world',
      version: 1,
    })).toEqual({
      hoverTarget: null,
      anchorRect: null,
    });

    expect(resolveTooltipAnchorState({
      target: { kind: 'zone', id: 'zone:a' },
      rect: {
        x: 30,
        y: 50,
        width: 120,
        height: 48,
        left: 30,
        top: 50,
        right: 150,
        bottom: 98,
      },
      space: 'screen',
      version: 2,
    })).toEqual({
      hoverTarget: { kind: 'zone', id: 'zone:a' },
      anchorRect: {
        x: 30,
        y: 50,
        width: 120,
        height: 48,
        left: 30,
        top: 50,
        right: 150,
        bottom: 98,
      },
    });
  });
});
