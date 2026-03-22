// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testDoubles = vi.hoisted(() => ({
  listBootstrapDescriptors: vi.fn(),
  resolveRunnerBootstrapHandle: vi.fn(),
  listSavedGames: vi.fn(),
}));

vi.mock('../../src/bootstrap/bootstrap-registry.js', () => ({
  listBootstrapDescriptors: testDoubles.listBootstrapDescriptors,
}));

vi.mock('../../src/bootstrap/runner-bootstrap.js', () => ({
  resolveRunnerBootstrapHandle: testDoubles.resolveRunnerBootstrapHandle,
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
    testDoubles.resolveRunnerBootstrapHandle.mockReset();
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
          playerMin: 4,
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
    testDoubles.resolveRunnerBootstrapHandle.mockImplementation((descriptor: { id: string }) => ({
      resolveCapabilities: async () => ({
        supportsMapEditor: descriptor.id === 'fitl',
      }),
    }));
    testDoubles.listSavedGames.mockResolvedValue([]);
  });

  it('renders game cards for non-default descriptors with metadata', async () => {
    const { GameSelectionScreen } = await import('../../src/ui/GameSelectionScreen.js');

    render(createElement(GameSelectionScreen, { onSelectGame: vi.fn() }));

    expect(screen.getByText('Fire in the Lake')).toBeTruthy();
    expect(screen.getByText("Texas Hold'em")).toBeTruthy();
    expect(screen.getByText('A 4-faction COIN-series wargame set in the Vietnam War')).toBeTruthy();
    expect(screen.getByText('Players: 4-4')).toBeTruthy();
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

  it('renders Edit Map only for games that support the editor and emits the correct id', async () => {
    const onEditMap = vi.fn();
    const { GameSelectionScreen } = await import('../../src/ui/GameSelectionScreen.js');

    render(createElement(GameSelectionScreen, { onSelectGame: vi.fn(), onEditMap }));

    await waitFor(() => {
      expect(screen.getByTestId('edit-map-fitl')).toBeTruthy();
    });
    expect(screen.queryByTestId('edit-map-texas')).toBeNull();

    fireEvent.click(screen.getByTestId('edit-map-fitl'));
    expect(onEditMap).toHaveBeenCalledWith('fitl');
  });

  it('hides Edit Map when shared bootstrap capability resolution fails', async () => {
    testDoubles.resolveRunnerBootstrapHandle.mockImplementation(() => ({
      resolveCapabilities: async () => {
        throw new Error('broken bootstrap');
      },
    }));

    const { GameSelectionScreen } = await import('../../src/ui/GameSelectionScreen.js');
    render(createElement(GameSelectionScreen, { onSelectGame: vi.fn(), onEditMap: vi.fn() }));

    await waitFor(() => {
      expect(screen.queryByTestId('edit-map-fitl')).toBeNull();
      expect(screen.queryByTestId('edit-map-texas')).toBeNull();
    });
  });

  it('renders saved game rows when save manager returns entries', async () => {
    testDoubles.listSavedGames.mockResolvedValue([
      {
        id: 'save-1',
        displayName: 'Campaign Night',
        gameName: 'Fire in the Lake',
        timestamp: 1735689600000,
        moveCount: 27,
        isTerminal: false,
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

  it('disables resume for terminal saves', async () => {
    testDoubles.listSavedGames.mockResolvedValue([
      {
        id: 'save-1',
        displayName: 'Campaign Night',
        gameName: 'Fire in the Lake',
        timestamp: 1735689600000,
        moveCount: 27,
        isTerminal: true,
      },
    ]);

    const { GameSelectionScreen } = await import('../../src/ui/GameSelectionScreen.js');
    render(createElement(GameSelectionScreen, { onSelectGame: vi.fn() }));

    await waitFor(() => {
      expect(screen.getByText('Campaign Night')).toBeTruthy();
    });
    expect((screen.getByRole('button', { name: 'Resume' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Completed')).toBeTruthy();
  });
});
