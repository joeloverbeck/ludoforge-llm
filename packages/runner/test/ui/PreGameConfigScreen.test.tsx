// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BootstrapDescriptor } from '../../src/bootstrap/bootstrap-registry.js';
import { PreGameConfigScreen } from '../../src/ui/PreGameConfigScreen.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PreGameConfigScreen', () => {
  it('renders player count slider bounds from descriptor metadata', () => {
    renderScreen();

    const slider = screen.getByTestId('pre-game-player-count');
    expect(slider.getAttribute('min')).toBe('4');
    expect(slider.getAttribute('max')).toBe('4');
  });

  it('renders seat rows for fixed FITL player count', () => {
    renderScreen();

    expect(screen.getByTestId('pre-game-seat-row-0')).toBeTruthy();
    expect(screen.getByTestId('pre-game-seat-row-1')).toBeTruthy();
    expect(screen.getByTestId('pre-game-seat-row-2')).toBeTruthy();
    expect(screen.getByTestId('pre-game-seat-row-3')).toBeTruthy();

    // FITL is fixed at 4 players; slider interaction is unnecessary here.
  });

  it('uses faction display names when visual config provides them', () => {
    renderScreen();

    expect(screen.getByTestId('pre-game-seat-label-0').textContent).toBe('US Forces');
    expect(screen.getByTestId('pre-game-seat-label-1').textContent).toBe('ARVN');
  });

  it('falls back to formatted faction id and then Player N labels', () => {
    renderScreen({
      gameMetadata: {
        name: 'Fallback Test',
        description: '',
        playerMin: 2,
        playerMax: 3,
        factionIds: ['south_vietnam', 'northVietnam'],
      },
      resolveVisualConfigYaml: () => ({ version: 1 }),
    });

    expect(screen.getByTestId('pre-game-seat-label-0').textContent).toBe('South Vietnam');
    expect(screen.getByTestId('pre-game-seat-label-1').textContent).toBe('North Vietnam');

    fireEvent.change(screen.getByTestId('pre-game-player-count'), { target: { value: '3' } });
    expect(screen.getByTestId('pre-game-seat-label-2').textContent).toBe('Player 2');
  });

  it('includes all seat type options', () => {
    renderScreen();

    const select = screen.getByTestId('pre-game-seat-type-0');
    const optionLabels = Array.from(select.querySelectorAll('option')).map((option) => option.textContent);
    expect(optionLabels).toEqual(['Human', 'AI - Random', 'AI - Greedy']);
  });

  it('uses provided seed when valid and emits PlayerSeatConfig[]', () => {
    const onStartGame = vi.fn();
    renderScreen({}, onStartGame);

    fireEvent.change(screen.getByTestId('pre-game-seed'), { target: { value: '12345' } });
    fireEvent.change(screen.getByTestId('pre-game-seat-type-1'), { target: { value: 'ai-greedy' } });
    fireEvent.click(screen.getByTestId('pre-game-start'));

    expect(onStartGame).toHaveBeenCalledWith(12345, [
      { playerId: 0, type: 'human' },
      { playerId: 1, type: 'ai-greedy' },
      { playerId: 2, type: 'ai-random' },
      { playerId: 3, type: 'ai-random' },
    ]);
  });

  it('generates a random safe-integer seed when input is empty', () => {
    const onStartGame = vi.fn();
    const getRandomValues = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((typedArray) => {
      const values = typedArray as Uint32Array;
      values[0] = 0x00000001;
      values[1] = 0x00000002;
      return typedArray;
    });

    renderScreen({}, onStartGame);
    fireEvent.click(screen.getByTestId('pre-game-start'));

    expect(onStartGame).toHaveBeenCalledTimes(1);
    const [seed] = onStartGame.mock.calls[0] as [number, unknown];
    expect(Number.isSafeInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('blocks start with invalid seed input', () => {
    const onStartGame = vi.fn();
    renderScreen({}, onStartGame);

    fireEvent.change(screen.getByTestId('pre-game-seed'), { target: { value: '-7' } });
    fireEvent.click(screen.getByTestId('pre-game-start'));

    expect(screen.getByTestId('pre-game-validation').textContent).toMatch(/non-negative safe integer/u);
    expect(onStartGame).not.toHaveBeenCalled();
  });

  it('blocks start when no human seat is selected', () => {
    const onStartGame = vi.fn();
    renderScreen({}, onStartGame);

    fireEvent.change(screen.getByTestId('pre-game-seat-type-0'), { target: { value: 'ai-random' } });
    fireEvent.change(screen.getByTestId('pre-game-seat-type-1'), { target: { value: 'ai-greedy' } });
    fireEvent.click(screen.getByTestId('pre-game-start'));

    expect(screen.getByTestId('pre-game-validation').textContent).toMatch(/At least one seat must be Human/u);
    expect(onStartGame).not.toHaveBeenCalled();
  });

  it('emits back action', () => {
    const onBack = vi.fn();
    renderScreen({}, vi.fn(), onBack);

    fireEvent.click(screen.getByTestId('pre-game-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

function renderScreen(
  overrides: Partial<BootstrapDescriptor> = {},
  onStartGame = vi.fn(),
  onBack = vi.fn(),
): void {
  const descriptor = {
    id: 'fitl',
    queryValue: 'fitl',
    defaultSeed: 42,
    defaultPlayerId: 0,
    sourceLabel: 'FITL fixture',
    gameMetadata: {
      name: 'Fire in the Lake',
      description: 'desc',
      playerMin: 4,
      playerMax: 4,
      factionIds: ['us', 'arvn', 'nva', 'vc'],
    },
    resolveGameDefInput: async () => ({}),
    resolveVisualConfigYaml: () => ({
      version: 1,
      factions: {
        us: { displayName: 'US Forces' },
        arvn: { displayName: 'ARVN' },
      },
    }),
    ...overrides,
  } satisfies BootstrapDescriptor;

  render(createElement(PreGameConfigScreen, {
    gameId: 'fitl',
    descriptor,
    onStartGame,
    onBack,
  }));
}
