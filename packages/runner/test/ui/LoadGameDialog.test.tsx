// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testDoubles = vi.hoisted(() => ({
  listSavedGames: vi.fn(),
  loadGame: vi.fn(),
  deleteSavedGame: vi.fn(),
}));

vi.mock('../../src/persistence/save-manager.js', () => ({
  listSavedGames: testDoubles.listSavedGames,
  loadGame: testDoubles.loadGame,
  deleteSavedGame: testDoubles.deleteSavedGame,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LoadGameDialog', () => {
  beforeEach(() => {
    vi.resetModules();
    testDoubles.listSavedGames.mockReset();
    testDoubles.loadGame.mockReset();
    testDoubles.deleteSavedGame.mockReset();

    testDoubles.listSavedGames.mockResolvedValue([
      {
        id: 'save-1',
        gameId: 'fitl',
        displayName: 'Campaign Night',
        gameName: 'Fire in the Lake',
        timestamp: 1735689600000,
        moveCount: 22,
        isTerminal: false,
      },
      {
        id: 'save-2',
        gameId: 'fitl',
        displayName: 'Completed Session',
        gameName: 'Fire in the Lake',
        timestamp: 1735689700000,
        moveCount: 40,
        isTerminal: true,
      },
    ]);
    testDoubles.loadGame.mockImplementation(async (id: string) => ({
      id,
      gameId: 'fitl',
      gameName: 'Fire in the Lake',
      displayName: 'Campaign Night',
      timestamp: 1735689600000,
      seed: 17,
      moveHistory: [{ actionId: 'tick', params: {} }],
      playerConfig: [{ playerId: 1, type: 'human' }],
      playerId: 1,
      moveCount: 1,
      isTerminal: id === 'save-2',
    }));
    testDoubles.deleteSavedGame.mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
  });

  it('lists saves and disables resume for terminal records', async () => {
    const { LoadGameDialog } = await import('../../src/ui/LoadGameDialog.js');

    render(createElement(LoadGameDialog, {
      isOpen: true,
      gameId: 'fitl',
      onResume: vi.fn(),
      onReplay: vi.fn(),
      onClose: vi.fn(),
    }));

    await waitFor(() => {
      expect(screen.getByText('Campaign Night')).toBeTruthy();
    });
    expect(screen.getByText('Completed Session')).toBeTruthy();

    const row = screen.getByTestId('load-game-row-save-2');
    const resumeButton = row.querySelector('button');
    expect(resumeButton).toBeTruthy();
    expect((resumeButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Completed')).toBeTruthy();
  });

  it('loads record and calls onResume', async () => {
    const onResume = vi.fn();
    const onClose = vi.fn();
    const { LoadGameDialog } = await import('../../src/ui/LoadGameDialog.js');

    render(createElement(LoadGameDialog, {
      isOpen: true,
      gameId: 'fitl',
      onResume,
      onReplay: vi.fn(),
      onClose,
    }));

    await waitFor(() => {
      expect(screen.getByText('Campaign Night')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Resume' })[0]!);

    await waitFor(() => {
      expect(testDoubles.loadGame).toHaveBeenCalledWith('save-1');
    });
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirms delete before removing save', async () => {
    const { LoadGameDialog } = await import('../../src/ui/LoadGameDialog.js');

    render(createElement(LoadGameDialog, {
      isOpen: true,
      gameId: 'fitl',
      onResume: vi.fn(),
      onReplay: vi.fn(),
      onClose: vi.fn(),
    }));

    await waitFor(() => {
      expect(screen.getByText('Campaign Night')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);

    await waitFor(() => {
      expect(testDoubles.deleteSavedGame).toHaveBeenCalledWith('save-1');
    });
  });
});
