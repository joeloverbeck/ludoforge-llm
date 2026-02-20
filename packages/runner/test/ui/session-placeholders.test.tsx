// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GameSelectionPlaceholder } from '../../src/ui/screens/GameSelectionPlaceholder.js';
import { PreGameConfigPlaceholder } from '../../src/ui/screens/PreGameConfigPlaceholder.js';
import { ReplayPlaceholder } from '../../src/ui/screens/ReplayPlaceholder.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('session placeholders', () => {
  it('renders game selection buttons and emits selected game id', () => {
    const onSelectGame = vi.fn();

    render(createElement(GameSelectionPlaceholder, {
      descriptors: [
        {
          id: 'fitl',
          queryValue: 'fitl',
          defaultSeed: 42,
          defaultPlayerId: 0,
          sourceLabel: 'FITL',
          resolveGameDefInput: async () => ({}),
          resolveVisualConfigYaml: () => null,
        },
      ],
      onSelectGame,
    }));

    fireEvent.click(screen.getByTestId('select-game-fitl'));
    expect(onSelectGame).toHaveBeenCalledWith('fitl');
  });

  it('renders pre-game placeholder and emits start/back actions', () => {
    const onStartGame = vi.fn();
    const onBack = vi.fn();

    render(createElement(PreGameConfigPlaceholder, {
      gameId: 'fitl',
      descriptor: {
        id: 'fitl',
        queryValue: 'fitl',
        defaultSeed: 9,
        defaultPlayerId: 2,
        sourceLabel: 'FITL',
        resolveGameDefInput: async () => ({}),
        resolveVisualConfigYaml: () => null,
      },
      onStartGame,
      onBack,
    }));

    fireEvent.click(screen.getByTestId('pre-game-start'));
    expect(onStartGame).toHaveBeenCalledWith(9, 2);

    fireEvent.click(screen.getByTestId('pre-game-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders replay placeholder and emits back action', () => {
    const onBackToMenu = vi.fn();

    render(createElement(ReplayPlaceholder, { onBackToMenu }));

    fireEvent.click(screen.getByTestId('replay-back-to-menu'));
    expect(onBackToMenu).toHaveBeenCalledTimes(1);
  });
});
