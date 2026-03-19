// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { GameBridge } from '../../src/bridge/game-bridge.js';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import type { GameStore } from '../../src/store/game-store.js';
import { GameContainer } from '../../src/ui/GameContainer.js';

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
  EventCardTooltip: () => createElement('div'),
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
    tooltipState: {
      description: null,
      anchorElement: null,
    },
    onActionHoverStart: vi.fn(),
    onActionHoverEnd: vi.fn(),
    onTooltipPointerEnter: vi.fn(),
    onTooltipPointerLeave: vi.fn(),
  }),
}));

vi.mock('../../src/ui/useCardTooltip.js', () => ({
  useCardTooltip: () => ({
    cardTooltipState: {
      card: null,
      anchorElement: null,
    },
    onCardHoverStart: vi.fn(),
    onCardHoverEnd: vi.fn(),
    onCardTooltipPointerEnter: vi.fn(),
    onCardTooltipPointerLeave: vi.fn(),
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

afterEach(() => {
  cleanup();
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
});
