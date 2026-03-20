// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BootstrapDescriptor } from '../../src/bootstrap/bootstrap-registry.js';
import { createAgentSeatController, createHumanSeatController } from '../../src/seat/seat-controller.js';
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

  it('includes controller kind options', () => {
    renderScreen();

    const select = screen.getByTestId('pre-game-seat-kind-0');
    const optionLabels = Array.from(select.querySelectorAll('option')).map((option) => option.textContent);
    expect(optionLabels).toEqual(['Human', 'Agent']);
  });

  it('includes explicit agent mode options for agent seats', () => {
    renderScreen();

    const select = screen.getByTestId('pre-game-seat-agent-1');
    const optionLabels = Array.from(select.querySelectorAll('option')).map((option) => option.textContent);
    expect(optionLabels).toEqual(['Authored Policy', 'Built-in Greedy', 'Built-in Random']);
  });

  it('uses provided seed when valid and emits PlayerSeatConfig[]', () => {
    const onStartGame = vi.fn();
    renderScreen({}, onStartGame);

    fireEvent.change(screen.getByTestId('pre-game-seed'), { target: { value: '12345' } });
    fireEvent.change(screen.getByTestId('pre-game-seat-agent-1'), { target: { value: 'builtin:greedy' } });
    fireEvent.click(screen.getByTestId('pre-game-start'));

    expect(onStartGame).toHaveBeenCalledWith(12345, [
      { playerId: 0, controller: createHumanSeatController() },
      { playerId: 1, controller: createAgentSeatController({ kind: 'builtin', builtinId: 'greedy' }) },
      { playerId: 2, controller: createAgentSeatController() },
      { playerId: 3, controller: createAgentSeatController() },
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

    fireEvent.change(screen.getByTestId('pre-game-seat-kind-0'), { target: { value: 'agent' } });
    fireEvent.change(screen.getByTestId('pre-game-seat-agent-0'), { target: { value: 'builtin:random' } });
    fireEvent.change(screen.getByTestId('pre-game-seat-agent-1'), { target: { value: 'builtin:greedy' } });
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

  it('fails closed when descriptor visual config is malformed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      renderScreen({
        resolveVisualConfigYaml: () => ({ version: 2 }),
      })).toThrow(/Invalid visual config schema/u);
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
