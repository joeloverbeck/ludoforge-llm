import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import { asActionId, asPlayerId } from '@ludoforge/engine/runtime';
import type { DecisionKey } from '@ludoforge/engine/runtime';

import type { GameStore } from '../../src/store/game-store.js';
import type { GameBridge } from '../../src/bridge/game-bridge.js';
import type { DiagnosticBuffer } from '../../src/animation/diagnostic-buffer.js';
import { GameContainer, resolveTooltipAnchorState } from '../../src/ui/GameContainer.js';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { computeDefaultFactionColor } from '../../src/config/visual-config-defaults.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

interface CapturedErrorStateProps {
  readonly error: { readonly message: string };
  readonly onRetry: () => void;
}

interface CapturedTooltipLayerProps {
  readonly hoverTarget: { readonly kind: 'zone' | 'token'; readonly id: string } | null;
  readonly anchorRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

interface CapturedGameCanvasProps {
  readonly interactionHighlights?: {
    readonly zoneIDs: readonly string[];
    readonly tokenIDs: readonly string[];
  };
  readonly onHoverAnchorChange?: (anchor: {
    readonly target: { readonly kind: 'zone' | 'token'; readonly id: string };
    readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly space: 'world' | 'screen';
    readonly version: number;
  } | null) => void;
  readonly onAnimationDiagnosticBufferChange?: (buffer: DiagnosticBuffer | null) => void;
}

interface CapturedUIOverlayProps {
  readonly topStatusContent?: ReactNode;
  readonly topSessionContent?: ReactNode;
  readonly topBarPresentation?: {
    readonly statusAlignment: 'center' | 'start';
  };
  readonly scoringBarContent?: ReactNode;
  readonly leftRailContent?: ReactNode;
  readonly rightRailContent?: ReactNode;
  readonly bottomPrimaryContent?: ReactNode;
  readonly bottomRightDockContent?: ReactNode;
  readonly floatingContent?: ReactNode;
}

interface CapturedActionToolbarProps {
  readonly store: unknown;
  readonly surfaceRevision: number;
  readonly onActionHoverStart?: (sourceKey: { readonly actionId: string }, element: HTMLElement) => void;
  readonly onActionHoverEnd?: () => void;
}

interface CapturedActionTooltipProps {
  readonly description: unknown;
  readonly anchorElement: HTMLElement;
}

const testDoubles = vi.hoisted(() => ({
  errorStateProps: null as CapturedErrorStateProps | null,
  tooltipLayerProps: null as CapturedTooltipLayerProps | null,
  gameCanvasProps: null as CapturedGameCanvasProps | null,
  uiOverlayProps: null as CapturedUIOverlayProps | null,
  actionToolbarProps: null as CapturedActionToolbarProps | null,
  actionTooltipProps: null as CapturedActionTooltipProps | null,
  actionTooltipHookState: {
    sourceKey: null as { readonly actionId: string; readonly surfaceRevision: number } | null,
    description: null as unknown,
    loading: false,
    anchorElement: null as HTMLElement | null,
    status: 'idle' as const,
    interactionOwner: null as null,
    revision: 0,
  },
  invalidateActionTooltip: vi.fn(),
}));
const TEST_VISUAL_CONFIG_PROVIDER = new VisualConfigProvider(null);
const TEST_BRIDGE = {} as unknown as GameBridge;

vi.mock('../../src/canvas/GameCanvas.js', () => ({
  GameCanvas: (props: CapturedGameCanvasProps) => {
    testDoubles.gameCanvasProps = props;
    return createElement('div', { 'data-testid': 'game-canvas' });
  },
}));

vi.mock('../../src/ui/ActionToolbar.js', () => ({
  ActionToolbar: (props: CapturedActionToolbarProps) => {
    testDoubles.actionToolbarProps = props;
    return createElement('div', { 'data-testid': 'action-toolbar' });
  },
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

vi.mock('../../src/ui/UIOverlay.js', () => ({
  UIOverlay: (props: CapturedUIOverlayProps) => {
    testDoubles.uiOverlayProps = props;
    return createElement(
      'div',
      { 'data-testid': 'ui-overlay' },
      createElement('div', { 'data-testid': 'ui-overlay-top-status' }, props.topStatusContent),
      createElement('div', { 'data-testid': 'ui-overlay-top-session' }, props.topSessionContent),
      createElement('div', { 'data-testid': 'ui-overlay-scoring' }, props.scoringBarContent),
      createElement('div', { 'data-testid': 'ui-overlay-left-rail' }, props.leftRailContent),
      createElement('div', { 'data-testid': 'ui-overlay-right-rail' }, props.rightRailContent),
      createElement('div', { 'data-testid': 'ui-overlay-bottom-primary' }, props.bottomPrimaryContent),
      createElement('div', { 'data-testid': 'ui-overlay-bottom-right-dock' }, props.bottomRightDockContent),
      createElement('div', { 'data-testid': 'ui-overlay-floating' }, props.floatingContent),
    );
  },
}));

vi.mock('../../src/ui/EventLogPanel.js', () => ({
  EventLogPanel: () => createElement('div', { 'data-testid': 'event-log-panel' }),
}));

vi.mock('../../src/ui/InterruptBanner.js', () => ({
  InterruptBanner: () => createElement('div', { 'data-testid': 'interrupt-banner' }),
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

vi.mock('../../src/ui/ActionTooltip.js', () => ({
  ActionTooltip: (props: CapturedActionTooltipProps) => {
    testDoubles.actionTooltipProps = props;
    return createElement('div', { 'data-testid': 'action-tooltip' });
  },
}));

vi.mock('../../src/ui/useActionTooltip.js', () => ({
  useActionTooltip: () => ({
    tooltipState: testDoubles.actionTooltipHookState,
    onActionHoverStart: vi.fn(),
    onActionHoverEnd: vi.fn(),
    onTooltipPointerEnter: vi.fn(),
    onTooltipPointerLeave: vi.fn(),
    invalidateActionTooltip: testDoubles.invalidateActionTooltip,
  }),
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
    actionGroups: [{ groupKey: 'core', groupName: 'Core', actions: [{ actionId: 'pass', displayName: 'Pass', isAvailable: true }] }],
    choiceBreadcrumb: [],
    choiceContext: null,
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    runtimeEligible: [],
    surfaces: {
      tableOverlays: [],
      showdown: null,
    },
    victoryStandings: null,
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
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'idle',
          error: null,
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).toContain('Loading game...');
    expect(html).not.toContain('data-testid="game-canvas"');
    expect(html).not.toContain('data-testid="ui-overlay"');
  });

  it('renders LoadingState when lifecycle is initializing', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'initializing',
          error: null,
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).toContain('Loading game...');
    expect(html).not.toContain('data-testid="game-canvas"');
    expect(html).not.toContain('data-testid="ui-overlay"');
  });

  it('renders ErrorState when error is non-null', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'init failed',
          },
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
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
    testDoubles.uiOverlayProps = null;
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).toContain('data-testid="game-canvas"');
    expect(html).toContain('data-testid="ui-overlay"');
    expect(html).toContain('data-testid="interrupt-banner"');
    expect(html).toContain('data-testid="phase-indicator"');
    expect(html).toContain('data-testid="turn-order-display"');
    expect(html).toContain('data-testid="event-deck-panel"');
    expect(html).toContain('data-testid="ui-overlay-top-status"');
    expect(html).toContain('data-testid="ui-overlay-top-session"');
    const overlayProps = testDoubles.uiOverlayProps as CapturedUIOverlayProps | null;
    expect(overlayProps).not.toBeNull();
    if (overlayProps === null) {
      throw new Error('Expected UIOverlay props to be captured.');
    }
    const topStatusHtml = renderToStaticMarkup(createElement('div', null, overlayProps.topStatusContent));
    const topSessionHtml = renderToStaticMarkup(createElement('div', null, overlayProps.topSessionContent));
    const rightRailHtml = renderToStaticMarkup(createElement('div', null, overlayProps.rightRailContent));
    const bottomDockHtml = renderToStaticMarkup(createElement('div', null, overlayProps.bottomRightDockContent));
    expect(topStatusHtml).toContain('data-testid="phase-indicator"');
    expect(topStatusHtml).toContain('data-testid="turn-order-display"');
    expect(topStatusHtml).toContain('data-testid="interrupt-banner"');
    expect(topStatusHtml).toContain('data-testid="event-deck-panel"');
    expect(topStatusHtml).not.toContain('data-testid="settings-menu-trigger"');
    expect(topSessionHtml).toContain('data-testid="settings-menu-trigger"');
    expect(topSessionHtml).toContain('data-testid="event-log-toggle-button"');
    expect(topSessionHtml).not.toContain('data-testid="settings-menu"');
    expect(html).toContain('data-testid="settings-menu-trigger"');
    expect(html).not.toContain('data-testid="variables-panel"');
    expect(rightRailHtml).toContain('data-testid="active-effects-panel"');
    expect(rightRailHtml).not.toContain('data-testid="event-log-panel"');
    expect(rightRailHtml).not.toContain('data-testid="scoreboard"');
    expect(rightRailHtml).not.toContain('data-testid="global-markers-bar"');
    expect(bottomDockHtml).toContain('data-testid="event-log-panel"');
    expect(html).toContain('data-testid="warnings-toast"');
    expect(html).toContain('data-testid="player-hand-panel"');
    expect(html).toContain('data-testid="terminal-overlay"');
    expect(html).toContain('data-testid="tooltip-layer"');
    expect(html).toContain('data-testid="event-log-toggle-button"');
    expectAppearsInOrder(html, [
      'phase-indicator',
      'turn-order-display',
      'interrupt-banner',
      'event-deck-panel',
    ]);
    expectAppearsInOrder(html, [
      'settings-menu-trigger',
      'event-log-toggle-button',
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
    expect(gameCanvasProps.onAnimationDiagnosticBufferChange).toEqual(expect.any(Function));
    expect(gameCanvasProps.interactionHighlights).toEqual({ zoneIDs: [], tokenIDs: [] });
  });

  it('places the settings trigger and session buttons in the top session slot', () => {
    testDoubles.uiOverlayProps = null;
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        onSave: vi.fn(),
        onLoad: vi.fn(),
        onQuit: vi.fn(),
      }),
    );

    const overlayProps = testDoubles.uiOverlayProps as CapturedUIOverlayProps | null;
    expect(overlayProps).not.toBeNull();
    if (overlayProps === null) {
      throw new Error('Expected UIOverlay props to be captured.');
    }

    const topStatusHtml = renderToStaticMarkup(createElement('div', null, overlayProps.topStatusContent));
    const topSessionHtml = renderToStaticMarkup(createElement('div', null, overlayProps.topSessionContent));

    expect(topStatusHtml).not.toContain('data-testid="session-save-button"');
    expect(topStatusHtml).not.toContain('data-testid="session-load-button"');
    expect(topStatusHtml).not.toContain('data-testid="session-quit-button"');
    expect(topStatusHtml).not.toContain('data-testid="settings-menu-trigger"');
    expect(topSessionHtml).toContain('data-testid="settings-menu-trigger"');
    expect(topSessionHtml).toContain('data-testid="event-log-toggle-button"');
    expect(topSessionHtml).toContain('data-testid="session-save-button"');
    expect(topSessionHtml).toContain('data-testid="session-load-button"');
    expect(topSessionHtml).toContain('data-testid="session-quit-button"');
    expect(html).toContain('data-testid="session-save-button"');
    expect(html).toContain('data-testid="session-load-button"');
    expect(html).toContain('data-testid="session-quit-button"');
  });

  it('passes runnerChrome top-bar presentation hints from the visual config provider into UIOverlay', () => {
    testDoubles.uiOverlayProps = null;
    renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
        }),
        visualConfigProvider: new VisualConfigProvider({
          version: 1,
          runnerChrome: {
            topBar: {
              statusAlignment: 'start',
            },
          },
        }),
      }),
    );

    const overlayProps = testDoubles.uiOverlayProps as CapturedUIOverlayProps | null;
    expect(overlayProps).not.toBeNull();
    if (overlayProps === null) {
      throw new Error('Expected UIOverlay props to be captured.');
    }

    expect(overlayProps.topBarPresentation).toEqual({
      statusAlignment: 'start',
    });
  });

  it('renders GameCanvas and UIOverlay when lifecycle is terminal', () => {
    testDoubles.uiOverlayProps = null;
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'terminal',
          error: null,
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).toContain('data-testid="game-canvas"');
    expect(html).toContain('data-testid="ui-overlay"');
    expect(html).toContain('data-testid="interrupt-banner"');
    expect(html).toContain('data-testid="phase-indicator"');
    expect(html).toContain('data-testid="turn-order-display"');
    expect(html).toContain('data-testid="event-deck-panel"');
    const overlayProps = testDoubles.uiOverlayProps as CapturedUIOverlayProps | null;
    expect(overlayProps).not.toBeNull();
    if (overlayProps === null) {
      throw new Error('Expected UIOverlay props to be captured.');
    }
    const topStatusHtml = renderToStaticMarkup(createElement('div', null, overlayProps.topStatusContent));
    const topSessionHtml = renderToStaticMarkup(createElement('div', null, overlayProps.topSessionContent));
    const rightRailHtml = renderToStaticMarkup(createElement('div', null, overlayProps.rightRailContent));
    expect(topStatusHtml).toContain('data-testid="phase-indicator"');
    expect(topStatusHtml).toContain('data-testid="turn-order-display"');
    expect(topStatusHtml).toContain('data-testid="interrupt-banner"');
    expect(topStatusHtml).toContain('data-testid="event-deck-panel"');
    expect(topSessionHtml).toContain('data-testid="settings-menu-trigger"');
    expect(html).toContain('data-testid="settings-menu-trigger"');
    expect(html).not.toContain('data-testid="variables-panel"');
    expect(rightRailHtml).toContain('data-testid="active-effects-panel"');
    expect(rightRailHtml).not.toContain('data-testid="scoreboard"');
    expect(rightRailHtml).not.toContain('data-testid="global-markers-bar"');
    expect(html).toContain('data-testid="player-hand-panel"');
    expect(html).toContain('data-testid="terminal-overlay"');
    expectAppearsInOrder(html, [
      'phase-indicator',
      'turn-order-display',
      'interrupt-banner',
      'event-deck-panel',
    ]);
    expectAppearsInOrder(html, [
      'settings-menu-trigger',
      'active-effects-panel',
    ]);
  });

  it('exposes faction CSS variables for gameDef faction ids on container root', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          gameDef: {
            seats: [
              { id: 'us' },
              { id: 'nva force' },
            ],
          } as unknown as GameStore['gameDef'],
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).toContain(`--faction-us:${computeDefaultFactionColor('us')}`);
    expect(html).toContain(`--faction-nva-force:${computeDefaultFactionColor('nva force')}`);
  });

  it('renders actions mode branch only', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel(),
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).toContain('data-testid="action-toolbar"');
    expect(html).toContain('data-testid="undo-control"');
    expect(html).not.toContain('data-testid="choice-panel-choicePending"');
    expect(html).not.toContain('data-testid="choice-panel-choiceConfirm"');
  });

  it('hides interactive bottom-bar controls in read-only mode', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel(),
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        readOnlyMode: true,
      }),
    );

    expect(html).not.toContain('data-testid="action-toolbar"');
    expect(html).not.toContain('data-testid="undo-control"');
    expect(html).not.toContain('data-testid="choice-panel-choicePending"');
    expect(html).not.toContain('data-testid="choice-panel-choiceConfirm"');
    expect(html).not.toContain('data-testid="choice-panel-choiceInvalid"');
    expect(html).not.toContain('data-testid="ai-turn-overlay"');
  });

  it('renders choicePending mode branch only', () => {
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('test-decision'),
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
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
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
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            choiceUi: { kind: 'confirmReady' },
          }),
          selectedAction: asActionId('pass'),
          partialMove: { actionId: asActionId('pass'), params: {} },
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
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
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            choiceUi: { kind: 'invalid', reason: 'ACTION_MOVE_MISMATCH' },
          }),
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
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
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            activePlayerID: asPlayerId(1),
          }),
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
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
        bridge: TEST_BRIDGE,
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
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
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
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'retry me',
          },
          clearError,
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
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

  it('does not register VariablesPanel in the right rail', () => {
    testDoubles.uiOverlayProps = null;
    renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    const overlayProps = testDoubles.uiOverlayProps as CapturedUIOverlayProps | null;
    expect(overlayProps).not.toBeNull();
    if (overlayProps === null) {
      throw new Error('Expected UIOverlay props to be captured.');
    }

    const rightRailHtml = renderToStaticMarkup(createElement('div', null, overlayProps.rightRailContent));
    expect(rightRailHtml).not.toContain('data-testid="variables-panel"');
  });

  it('routes EventLogPanel through the bottom-right dock instead of the right rail', () => {
    testDoubles.uiOverlayProps = null;
    renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
        readOnlyMode: true,
      }),
    );

    const overlayProps = testDoubles.uiOverlayProps as CapturedUIOverlayProps | null;
    expect(overlayProps).not.toBeNull();
    if (overlayProps === null) {
      throw new Error('Expected UIOverlay props to be captured.');
    }

    const rightRailHtml = renderToStaticMarkup(createElement('div', null, overlayProps.rightRailContent));
    const bottomDockHtml = renderToStaticMarkup(createElement('div', null, overlayProps.bottomRightDockContent));

    expect(rightRailHtml).not.toContain('data-testid="event-log-panel"');
    expect(bottomDockHtml).toContain('data-testid="event-log-panel"');
  });

  it('keeps the event log docked across action, choice, AI-turn, and read-only bottom states', () => {
    const scenarios = [
      {
        name: 'actions',
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel(),
        }),
        readOnlyMode: false,
        expectedPrimaryTestId: 'action-toolbar',
      },
      {
        name: 'choicePending',
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            choiceUi: {
              kind: 'discreteOne',
              decisionKey: asDecisionKey('test-decision'),
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
        readOnlyMode: false,
        expectedPrimaryTestId: 'choice-panel-choicePending',
      },
      {
        name: 'aiTurn',
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            activePlayerID: asPlayerId(1),
          }),
        }),
        readOnlyMode: false,
        expectedPrimaryTestId: 'ai-turn-overlay',
      },
      {
        name: 'readOnly',
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel(),
        }),
        readOnlyMode: true,
        expectedPrimaryTestId: null,
      },
    ] as const;

    for (const scenario of scenarios) {
      testDoubles.uiOverlayProps = null;

      renderToStaticMarkup(
        createElement(GameContainer, {
          bridge: TEST_BRIDGE,
          store: scenario.store,
          visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
          readOnlyMode: scenario.readOnlyMode,
        }),
      );

      const overlayProps = testDoubles.uiOverlayProps as CapturedUIOverlayProps | null;
      expect(overlayProps, `Expected UIOverlay props for ${scenario.name}.`).not.toBeNull();
      if (overlayProps === null) {
        throw new Error(`Expected UIOverlay props to be captured for ${scenario.name}.`);
      }

      const rightRailHtml = renderToStaticMarkup(createElement('div', null, overlayProps.rightRailContent));
      const bottomPrimaryHtml = renderToStaticMarkup(createElement('div', null, overlayProps.bottomPrimaryContent));
      const bottomDockHtml = renderToStaticMarkup(createElement('div', null, overlayProps.bottomRightDockContent));

      expect(rightRailHtml, `Expected right rail ownership for ${scenario.name}.`).not.toContain('data-testid="event-log-panel"');
      expect(bottomDockHtml, `Expected dock ownership for ${scenario.name}.`).toContain('data-testid="event-log-panel"');
      if (scenario.expectedPrimaryTestId === null) {
        expect(bottomPrimaryHtml, `Expected empty bottom primary slot for ${scenario.name}.`).not.toContain('data-testid=');
      } else {
        expect(bottomPrimaryHtml, `Expected primary bottom content for ${scenario.name}.`)
          .toContain(`data-testid="${scenario.expectedPrimaryTestId}"`);
      }
    }
  });

  it('passes onActionHoverStart and onActionHoverEnd to ActionToolbar', () => {
    testDoubles.actionToolbarProps = null;
    testDoubles.actionTooltipHookState = {
      sourceKey: null,
      description: null,
      loading: false,
      anchorElement: null,
      status: 'idle',
      interactionOwner: null,
      revision: 0,
    };

    renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel(),
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    const capturedProps = testDoubles.actionToolbarProps as CapturedActionToolbarProps | null;
    expect(capturedProps).not.toBeNull();
    if (capturedProps === null) {
      throw new Error('Expected ActionToolbar props to be captured.');
    }
    expect(capturedProps.surfaceRevision).toEqual(expect.any(Number));
    expect(capturedProps.onActionHoverStart).toEqual(expect.any(Function));
    expect(capturedProps.onActionHoverEnd).toEqual(expect.any(Function));
  });

  it('does not render ActionTooltip when tooltip state has no description', () => {
    testDoubles.actionTooltipProps = null;
    testDoubles.actionTooltipHookState = {
      sourceKey: null,
      description: null,
      loading: false,
      anchorElement: null,
      status: 'idle',
      interactionOwner: null,
      revision: 0,
    };

    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel(),
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).not.toContain('data-testid="action-tooltip"');
    expect(testDoubles.actionTooltipProps).toBeNull();
  });

  it('renders ActionTooltip when tooltip state has description and anchorElement', () => {
    testDoubles.actionTooltipProps = null;
    const fakeAnchor = {} as HTMLElement;
    testDoubles.actionTooltipHookState = {
      sourceKey: {
        actionId: 'pass',
        surfaceRevision: 1,
      },
      description: { sections: [], limitUsage: [] },
      loading: false,
      anchorElement: fakeAnchor,
      status: 'visible',
      interactionOwner: 'source',
      revision: 1,
    };

    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel(),
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).toContain('data-testid="action-tooltip"');
    const capturedProps = testDoubles.actionTooltipProps as CapturedActionTooltipProps | null;
    expect(capturedProps).not.toBeNull();
    if (capturedProps === null) {
      throw new Error('Expected ActionTooltip props to be captured.');
    }
    expect(capturedProps.description).toEqual({ sections: [], limitUsage: [] });
    expect(capturedProps.anchorElement).toBe(fakeAnchor);
  });

  it('does not render ActionTooltip when bottom bar is not in actions mode even with tooltip state', () => {
    testDoubles.actionTooltipProps = null;
    testDoubles.actionTooltipHookState = {
      sourceKey: {
        actionId: 'pass',
        surfaceRevision: 1,
      },
      description: { sections: [], limitUsage: [] },
      loading: false,
      anchorElement: {} as HTMLElement,
      status: 'visible',
      interactionOwner: 'source',
      revision: 1,
    };

    // AI turn → bottomBarState is 'aiTurn', not 'actions'
    const html = renderToStaticMarkup(
      createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          gameLifecycle: 'playing',
          error: null,
          renderModel: makeRenderModel({
            activePlayerID: asPlayerId(1),
          }),
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }),
    );

    expect(html).not.toContain('data-testid="action-tooltip"');
    expect(testDoubles.actionTooltipProps).toBeNull();
  });
});
