// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testDoubles = vi.hoisted(() => ({
  listBootstrapDescriptors: vi.fn(),
  listSavedGames: vi.fn(),
}));

vi.mock('../../src/bootstrap/bootstrap-registry.js', () => ({
  listBootstrapDescriptors: testDoubles.listBootstrapDescriptors,
}));

vi.mock('../../src/persistence/save-manager.js', () => ({
  listSavedGames: testDoubles.listSavedGames,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GameSelectionScreen', () => {
  beforeEach(() => {
    vi.resetModules();
    testDoubles.listBootstrapDescriptors.mockReset();
    testDoubles.listSavedGames.mockReset();

    testDoubles.listBootstrapDescriptors.mockReturnValue([
      {
        id: 'default',
        queryValue: 'default',
        defaultSeed: 42,
        defaultPlayerId: 0,
        sourceLabel: 'default fixture',
        gameMetadata: {
          name: 'Runner Bootstrap Default',
          description: 'Development fixture',
          playerMin: 1,
          playerMax: 1,
          factionIds: [],
        },
        resolveGameDefInput: async () => ({}),
        resolveVisualConfigYaml: () => null,
      },
      {
        id: 'fitl',
        queryValue: 'fitl',
        defaultSeed: 42,
        defaultPlayerId: 0,
        sourceLabel: 'FITL fixture',
        gameMetadata: {
          name: 'Fire in the Lake',
          description: 'A 4-faction COIN-series wargame set in the Vietnam War',
          playerMin: 2,
          playerMax: 4,
          factionIds: ['us', 'arvn', 'nva', 'vc'],
        },
        resolveGameDefInput: async () => ({}),
        resolveVisualConfigYaml: () => null,
      },
      {
        id: 'texas',
        queryValue: 'texas',
        defaultSeed: 42,
        defaultPlayerId: 0,
        sourceLabel: 'Texas fixture',
        gameMetadata: {
          name: "Texas Hold'em",
          description: "No-limit Texas Hold'em poker tournament",
          playerMin: 2,
          playerMax: 10,
          factionIds: [],
        },
        resolveGameDefInput: async () => ({}),
        resolveVisualConfigYaml: () => null,
      },
    ]);
    testDoubles.listSavedGames.mockResolvedValue([]);
  });

  it('renders game cards for non-default descriptors with metadata', async () => {
    const { GameSelectionScreen } = await import('../../src/ui/GameSelectionScreen.js');

    render(createElement(GameSelectionScreen, { onSelectGame: vi.fn() }));

    expect(screen.getByText('Fire in the Lake')).toBeTruthy();
    expect(screen.getByText("Texas Hold'em")).toBeTruthy();
    expect(screen.getByText('A 4-faction COIN-series wargame set in the Vietnam War')).toBeTruthy();
    expect(screen.getByText('Players: 2-4')).toBeTruthy();
    expect(screen.queryByTestId('select-game-default')).toBeNull();

    await waitFor(() => {
      expect(screen.getByText('No saved games')).toBeTruthy();
    });
  });

  it('emits selected game id when a game card is clicked', async () => {
    const onSelectGame = vi.fn();
    const { GameSelectionScreen } = await import('../../src/ui/GameSelectionScreen.js');

    render(createElement(GameSelectionScreen, { onSelectGame }));

    fireEvent.click(screen.getByTestId('select-game-fitl'));
    expect(onSelectGame).toHaveBeenCalledWith('fitl');
  });

  it('renders saved game rows when save manager returns entries', async () => {
    testDoubles.listSavedGames.mockResolvedValue([
      {
        id: 'save-1',
        displayName: 'Campaign Night',
        gameName: 'Fire in the Lake',
        timestamp: 1735689600000,
        moveCount: 27,
      },
    ]);

    const { GameSelectionScreen } = await import('../../src/ui/GameSelectionScreen.js');
    render(createElement(GameSelectionScreen, { onSelectGame: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByText('Campaign Night')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });
});
