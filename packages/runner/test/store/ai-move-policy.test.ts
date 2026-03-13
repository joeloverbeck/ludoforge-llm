import { describe, expect, it, vi } from 'vitest';
import { asActionId, type Move } from '@ludoforge/engine/runtime';

import { isMctsSeat, resolveAiPlaybackDelayMs, resolveAiSeat, selectAiMove } from '../../src/store/ai-move-policy.js';

const MOVE_A: Move = { actionId: asActionId('a'), params: {} };
const MOVE_B: Move = { actionId: asActionId('b'), params: {} };
const MOVE_C: Move = { actionId: asActionId('c'), params: {} };

describe('ai-move-policy', () => {
  it('resolveAiSeat maps unknown/undefined seats to ai-random', () => {
    expect(resolveAiSeat(undefined)).toBe('ai-random');
    expect(resolveAiSeat('human')).toBe('ai-random');
    expect(resolveAiSeat('ai-random')).toBe('ai-random');
  });

  it('resolveAiSeat preserves ai-greedy', () => {
    expect(resolveAiSeat('ai-greedy')).toBe('ai-greedy');
  });

  it('resolveAiSeat preserves MCTS seat types', () => {
    expect(resolveAiSeat('ai-mcts-fast')).toBe('ai-mcts-fast');
    expect(resolveAiSeat('ai-mcts-default')).toBe('ai-mcts-default');
    expect(resolveAiSeat('ai-mcts-strong')).toBe('ai-mcts-strong');
  });

  it('isMctsSeat returns true for MCTS seats and false for others', () => {
    expect(isMctsSeat('ai-mcts-fast')).toBe(true);
    expect(isMctsSeat('ai-mcts-default')).toBe(true);
    expect(isMctsSeat('ai-mcts-strong')).toBe(true);
    expect(isMctsSeat('ai-random')).toBe(false);
    expect(isMctsSeat('ai-greedy')).toBe(false);
    expect(isMctsSeat('human')).toBe(false);
  });

  it('selectAiMove returns null when there are no legal moves', () => {
    expect(selectAiMove('ai-random', [])).toBeNull();
    expect(selectAiMove('ai-greedy', [])).toBeNull();
  });

  it('selectAiMove with ai-greedy always picks first legal move', () => {
    const result = selectAiMove('ai-greedy', [MOVE_A, MOVE_B, MOVE_C]);
    expect(result).not.toBeNull();
    expect(result!.move).toEqual(MOVE_A);
    expect(result!.selectedIndex).toBe(0);
    expect(result!.candidateCount).toBe(3);
  });

  it('selectAiMove with ai-random picks move by random index deterministically', () => {
    const random = vi.fn<() => number>().mockReturnValue(0.51);
    const result = selectAiMove('ai-random', [MOVE_A, MOVE_B, MOVE_C], random);

    expect(random).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result!.move).toEqual(MOVE_B);
    expect(result!.selectedIndex).toBe(1);
    expect(result!.candidateCount).toBe(3);
  });

  it('selectAiMove clamps invalid random values', () => {
    const nanResult = selectAiMove('ai-random', [MOVE_A, MOVE_B], () => Number.NaN);
    const highResult = selectAiMove('ai-random', [MOVE_A, MOVE_B], () => Number.POSITIVE_INFINITY);
    const aboveOneResult = selectAiMove('ai-random', [MOVE_A, MOVE_B], () => 2);

    expect(nanResult!.move).toEqual(MOVE_A);
    expect(highResult!.move).toEqual(MOVE_A);
    expect(aboveOneResult!.move).toEqual(MOVE_B);
  });

  it('resolveAiPlaybackDelayMs maps speed tiers to deterministic step delays', () => {
    expect(resolveAiPlaybackDelayMs('1x')).toBe(500);
    expect(resolveAiPlaybackDelayMs('2x')).toBe(250);
    expect(resolveAiPlaybackDelayMs('4x')).toBe(125);
    expect(resolveAiPlaybackDelayMs('4x', 400)).toBe(100);
  });

  it('resolveAiPlaybackDelayMs rejects invalid base delays', () => {
    expect(() => resolveAiPlaybackDelayMs('1x', Number.NaN)).toThrow(/base delay/u);
    expect(() => resolveAiPlaybackDelayMs('1x', -1)).toThrow(/base delay/u);
  });
});
