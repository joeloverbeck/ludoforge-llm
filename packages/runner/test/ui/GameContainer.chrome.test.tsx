// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { asPlayerId } from '@ludoforge/engine/runtime';

import type { GameBridge } from '../../src/bridge/game-bridge.js';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import type { GameStore } from '../../src/store/game-store.js';
import { GameContainer } from '../../src/ui/GameContainer.js';
import { makeRenderModelFixture as makeRenderModel } from './helpers/render-model-fixture.js';

const testDoubles = vi.hoisted(() => ({
  actionTooltipState: {
    sourceKey: null as { readonly actionId: string; readonly surfaceRevision: number } | null,
    description: null as unknown,
    loading: false,
    anchorElement: null as HTMLElement | null,
    status: 'idle' as 'idle' | 'pending' | 'visible',
    interactionOwner: null as null | 'source',
    revision: 0,
  },
  invalidateActionTooltip: vi.fn(),
  cardTooltipState: {
    card: null as {
      readonly id: string;
      readonly title: string;
      readonly orderNumber: number | null;
      readonly eligibility: null;
      readonly sideMode: 'single' | 'dual';
      readonly unshadedText: string | null;
      readonly shadedText: string | null;
    } | null,
    anchorElement: null as HTMLElement | null,
    status: 'idle' as 'idle' | 'pending' | 'visible',
    interactionOwner: null as null | 'source',
    revision: 0,
  },
  onCardTooltipPointerEnter: vi.fn(),
  onCardTooltipPointerLeave: vi.fn(),
  eventCardTooltipProps: null as {
    readonly card: {
      readonly id: string;
      readonly title: string;
    };
    readonly anchorElement: HTMLElement;
    readonly onPointerEnter?: () => void;
    readonly onPointerLeave?: () => void;
  } | null,
}));

vi.mock('../../src/canvas/GameCanvas.js', () => ({
  GameCanvas: () => createElement('div', { 'data-testid': 'game-canvas' }),
}));

vi.mock('../../src/ui/ActionToolbar.js', () => ({
  ActionToolbar: () => createElement('div'),
}));

vi.mock('../../src/ui/ChoicePanel.js', () => ({
  ChoicePanel: () => createElement('div'),
}));

vi.mock('../../src/ui/EligiblePanel.js', () => ({
  EligiblePanel: () => createElement('div'),
}));

vi.mock('../../src/ui/ErrorState.js', () => ({
  ErrorState: () => createElement('div'),
}));

vi.mock('../../src/ui/EventDeckPanel.js', () => ({
  EventDeckPanel: () => createElement('div'),
}));

vi.mock('../../src/ui/LoadingState.js', () => ({
  LoadingState: () => createElement('div'),
}));

vi.mock('../../src/ui/InterruptBanner.js', () => ({
  InterruptBanner: () => createElement('div'),
}));

vi.mock('../../src/ui/PhaseIndicator.js', () => ({
  PhaseIndicator: () => createElement('div'),
}));

vi.mock('../../src/ui/ActiveEffectsPanel.js', () => ({
  ActiveEffectsPanel: () => createElement('div'),
}));

vi.mock('../../src/ui/TurnOrderDisplay.js', () => ({
  TurnOrderDisplay: () => createElement('div'),
}));

vi.mock('../../src/ui/UndoControl.js', () => ({
  UndoControl: () => createElement('div'),
}));

vi.mock('../../src/ui/PlayerHandPanel.js', () => ({
  PlayerHandPanel: () => createElement('div'),
}));

vi.mock('../../src/ui/AITurnOverlay.js', () => ({
  AITurnOverlay: () => createElement('div'),
}));

vi.mock('../../src/ui/WarningsToast.js', () => ({
  WarningsToast: () => createElement('div'),
}));

vi.mock('../../src/ui/TooltipLayer.js', () => ({
  TooltipLayer: () => createElement('div'),
}));

vi.mock('../../src/ui/ActionTooltip.js', () => ({
  ActionTooltip: () => createElement('div'),
}));

vi.mock('../../src/ui/EventCardTooltip.js', () => ({
  EventCardTooltip: (props: NonNullable<typeof testDoubles.eventCardTooltipProps>) => {
    testDoubles.eventCardTooltipProps = props;
    return createElement('div', { 'data-testid': 'event-card-tooltip' });
  },
}));

vi.mock('../../src/ui/PhaseBannerOverlay.js', () => ({
  PhaseBannerOverlay: () => createElement('div'),
}));

vi.mock('../../src/ui/ShowdownOverlay.js', () => ({
  ShowdownOverlay: () => createElement('div'),
}));

vi.mock('../../src/ui/TerminalOverlay.js', () => ({
  TerminalOverlay: () => createElement('div'),
}));

vi.mock('../../src/ui/VictoryStandingsBar.js', () => ({
  VictoryStandingsBar: () => createElement('div'),
}));

vi.mock('../../src/ui/EventLogPanel.js', () => ({
  EventLogPanel: () => createElement('div', { 'data-testid': 'event-log-panel' }),
}));

vi.mock('../../src/ui/useEventLogEntries.js', () => ({
  useEventLogEntries: () => [],
}));

vi.mock('../../src/ui/useActionTooltip.js', () => ({
  useActionTooltip: () => ({
    tooltipState: testDoubles.actionTooltipState,
    onActionHoverStart: vi.fn(),
    onActionHoverEnd: vi.fn(),
    onTooltipPointerEnter: vi.fn(),
    onTooltipPointerLeave: vi.fn(),
    invalidateActionTooltip: testDoubles.invalidateActionTooltip,
  }),
}));

vi.mock('../../src/ui/useCardTooltip.js', () => ({
  useCardTooltip: () => ({
    cardTooltipState: testDoubles.cardTooltipState,
    onCardHoverStart: vi.fn(),
    onCardHoverEnd: vi.fn(),
    onCardTooltipPointerEnter: testDoubles.onCardTooltipPointerEnter,
    onCardTooltipPointerLeave: testDoubles.onCardTooltipPointerLeave,
  }),
}));

const TEST_BRIDGE = {} as unknown as GameBridge;
const TEST_VISUAL_CONFIG_PROVIDER = new VisualConfigProvider(null);

function createContainerStore(overrides: Partial<GameStore> = {}): StoreApi<GameStore> {
  return createStore<GameStore>(() => ({
    gameLifecycle: 'playing',
    error: null,
    runnerProjection: null,
    renderModel: null,
    gameDef: null,
    animationPlaying: true,
    animationPaused: false,
    animationPlaybackSpeed: '1x',
    aiPlaybackDetailLevel: 'standard',
    aiPlaybackAutoSkip: false,
    setAnimationPlaybackSpeed: vi.fn(),
    setAnimationPaused: vi.fn(),
    requestAnimationSkipCurrent: vi.fn(),
    setAiPlaybackDetailLevel: vi.fn(),
    setAiPlaybackAutoSkip: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  } as unknown as GameStore));
}

function makeActionRenderModel(overrides: Partial<NonNullable<GameStore['renderModel']>> = {}): NonNullable<GameStore['renderModel']> {
  return makeRenderModel({
    actionGroups: [{
      groupKey: 'core',
      groupName: 'Core',
      actions: [{ actionId: 'pass', displayName: 'Pass', isAvailable: true }],
    }],
    ...overrides,
  });
}

function setVisibleActionTooltipState(surfaceRevision: number): void {
  testDoubles.actionTooltipState = {
    sourceKey: {
      actionId: 'pass',
      surfaceRevision,
    },
    description: { sections: [{ kind: 'group', label: 'Test', children: [] }], limitUsage: [] },
    loading: false,
    anchorElement: document.createElement('button'),
    status: 'visible',
    interactionOwner: 'source',
    revision: surfaceRevision,
  };
}

afterEach(() => {
  cleanup();
  testDoubles.invalidateActionTooltip.mockReset();
  testDoubles.onCardTooltipPointerEnter.mockReset();
  testDoubles.onCardTooltipPointerLeave.mockReset();
  testDoubles.eventCardTooltipProps = null;
  testDoubles.actionTooltipState = {
    sourceKey: null,
    description: null,
    loading: false,
    anchorElement: null,
    status: 'idle',
    interactionOwner: null,
    revision: 0,
  };
  testDoubles.cardTooltipState = {
    card: null,
    anchorElement: null,
    status: 'idle',
    interactionOwner: null,
    revision: 0,
  };
});

describe('GameContainer chrome state', () => {
  it('dispatches playback and AI actions from the settings menu', async () => {
    const setAnimationPlaybackSpeed = vi.fn();
    const setAnimationPaused = vi.fn();
    const requestAnimationSkipCurrent = vi.fn();
    const setAiPlaybackDetailLevel = vi.fn();
    const setAiPlaybackAutoSkip = vi.fn();

    render(createElement(GameContainer, {
      bridge: TEST_BRIDGE,
      store: createContainerStore({
        animationPlaying: true,
        animationPaused: false,
        animationPlaybackSpeed: '1x',
        aiPlaybackDetailLevel: 'standard',
        aiPlaybackAutoSkip: false,
        setAnimationPlaybackSpeed,
        setAnimationPaused,
        requestAnimationSkipCurrent,
        setAiPlaybackDetailLevel,
        setAiPlaybackAutoSkip,
      }),
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      readOnlyMode: true,
    }));

    fireEvent.click(screen.getByTestId('settings-menu-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-menu')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('settings-control-speed-4x'));
    expect(setAnimationPlaybackSpeed).toHaveBeenCalledWith('4x');

    fireEvent.change(screen.getByLabelText('AI Detail'), { target: { value: 'minimal' } });
    expect(setAiPlaybackDetailLevel).toHaveBeenCalledWith('minimal');

    fireEvent.click(screen.getByLabelText('AI Auto-Skip'));
    expect(setAiPlaybackAutoSkip).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByTestId('settings-control-pause-toggle'));
    expect(setAnimationPaused).toHaveBeenCalledWith(true);

    await waitFor(() => {
      expect(screen.queryByTestId('settings-menu')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('settings-menu-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-menu')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('settings-control-skip-current'));
    expect(requestAnimationSkipCurrent).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByTestId('settings-menu')).toBeNull();
    });
  });

  it('uses the same backing state for the log button and the l keyboard shortcut', async () => {
    render(createElement(GameContainer, {
      bridge: TEST_BRIDGE,
      store: createContainerStore(),
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      readOnlyMode: true,
    }));

    expect(screen.getByTestId('event-log-panel')).toBeTruthy();
    expect(screen.getByTestId('ui-overlay-bottom-right-dock').contains(screen.getByTestId('event-log-panel'))).toBe(true);
    expect(screen.getByTestId('event-log-toggle-button').textContent).toBe('Hide Log');

    fireEvent.click(screen.getByTestId('event-log-toggle-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('event-log-panel')).toBeNull();
      expect(screen.getByTestId('event-log-toggle-button').textContent).toBe('Show Log');
    });

    fireEvent.keyDown(document, { key: 'l' });

    await waitFor(() => {
      expect(screen.getByTestId('event-log-panel')).toBeTruthy();
      expect(screen.getByTestId('event-log-toggle-button').textContent).toBe('Hide Log');
    });
  });

  it('does not trigger the log shortcut while editing a text field', async () => {
    render(createElement(GameContainer, {
      bridge: TEST_BRIDGE,
      store: createContainerStore(),
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      readOnlyMode: true,
    }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: 'l' });

    await waitFor(() => {
      expect(screen.getByTestId('event-log-panel')).toBeTruthy();
      expect(screen.getByTestId('event-log-toggle-button').textContent).toBe('Hide Log');
    });

    input.remove();
  });

  it('resets event-log visibility and closes the settings menu when a new game store is mounted', async () => {
    const firstStore = createContainerStore();
    const secondStore = createContainerStore();
    const rendered = render(createElement(GameContainer, {
      bridge: TEST_BRIDGE,
      store: firstStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      readOnlyMode: true,
    }));

    fireEvent.click(screen.getByTestId('event-log-toggle-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('event-log-panel')).toBeNull();
      expect(screen.getByTestId('event-log-toggle-button').textContent).toBe('Show Log');
    });

    fireEvent.click(screen.getByTestId('settings-menu-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-menu')).toBeTruthy();
    });

    rendered.rerender(createElement(GameContainer, {
      bridge: TEST_BRIDGE,
      store: secondStore,
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      readOnlyMode: true,
    }));

    await waitFor(() => {
      expect(screen.getByTestId('event-log-panel')).toBeTruthy();
      expect(screen.getByTestId('event-log-toggle-button').textContent).toBe('Hide Log');
      expect(screen.queryByTestId('settings-menu')).toBeNull();
    });
  });

  it('invalidates action tooltips when the action surface lifecycle changes', async () => {
    const lifecycleScenarios = [
      {
        name: 'action-surface transition while staying in actions',
        nextRenderModel: makeActionRenderModel({
          actionGroups: [{
            groupKey: 'special',
            groupName: 'Special',
            actions: [{ actionId: 'trade', displayName: 'Trade', isAvailable: true }],
          }],
        }),
      },
      {
        name: 'move confirm surface rebuild',
        nextRenderModel: makeActionRenderModel(),
      },
      {
        name: 'move cancel surface rebuild',
        nextRenderModel: makeActionRenderModel(),
      },
      {
        name: 'undo surface rebuild',
        nextRenderModel: makeActionRenderModel(),
      },
      {
        name: 'active-player change',
        nextRenderModel: makeActionRenderModel({
          activePlayerID: asPlayerId(1),
          players: [
            {
              id: asPlayerId(0),
              displayName: 'Player 0',
              isHuman: true,
              isActive: false,
              isEliminated: false,
              factionId: null,
            },
            {
              id: asPlayerId(1),
              displayName: 'Player 1',
              isHuman: true,
              isActive: true,
              isEliminated: false,
              factionId: null,
            },
          ],
        }),
      },
      {
        name: 'transition out of actions',
        nextRenderModel: makeActionRenderModel({
          choiceUi: { kind: 'confirmReady' },
        }),
      },
    ] as const;

    for (const scenario of lifecycleScenarios) {
      setVisibleActionTooltipState(1);
      const rendered = render(createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          renderModel: makeActionRenderModel(),
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }));

      expect(testDoubles.invalidateActionTooltip, `Expected no eager invalidation for ${scenario.name}.`).not.toHaveBeenCalled();

      rendered.rerender(createElement(GameContainer, {
        bridge: TEST_BRIDGE,
        store: createContainerStore({
          renderModel: scenario.nextRenderModel,
        }),
        visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
      }));

      await waitFor(() => {
        expect(testDoubles.invalidateActionTooltip, `Expected invalidation for ${scenario.name}.`).toHaveBeenCalledTimes(1);
      });

      rendered.unmount();
      testDoubles.invalidateActionTooltip.mockReset();
    }
  });

  it('wires visible card tooltip state into EventCardTooltip', async () => {
    const anchorElement = document.createElement('div');
    testDoubles.cardTooltipState = {
      card: {
        id: 'card-1',
        title: 'Containment',
        orderNumber: 5,
        eligibility: null,
        sideMode: 'dual',
        unshadedText: 'Aid +6.',
        shadedText: 'NVA Resources +6.',
      },
      anchorElement,
      status: 'visible',
      interactionOwner: 'source',
      revision: 1,
    };

    render(createElement(GameContainer, {
      bridge: TEST_BRIDGE,
      store: createContainerStore({
        renderModel: makeActionRenderModel(),
      }),
      visualConfigProvider: TEST_VISUAL_CONFIG_PROVIDER,
    }));

    await waitFor(() => {
      expect(screen.getByTestId('event-card-tooltip')).toBeTruthy();
    });

    expect(testDoubles.eventCardTooltipProps).toMatchObject({
      card: {
        id: 'card-1',
        title: 'Containment',
      },
      anchorElement,
      onPointerEnter: testDoubles.onCardTooltipPointerEnter,
      onPointerLeave: testDoubles.onCardTooltipPointerLeave,
    });
  });
});
