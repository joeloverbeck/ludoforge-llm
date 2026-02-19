import { describe, expect, it, vi } from 'vitest';
import { asActionId, type Move } from '@ludoforge/engine/runtime';

import { resolveAiPlaybackDelayMs, resolveAiSeat, selectAiMove } from '../../src/store/ai-move-policy.js';

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

  it('selectAiMove returns null when there are no legal moves', () => {
    expect(selectAiMove('ai-random', [])).toBeNull();
    expect(selectAiMove('ai-greedy', [])).toBeNull();
  });

  it('selectAiMove with ai-greedy always picks first legal move', () => {
    expect(selectAiMove('ai-greedy', [MOVE_A, MOVE_B, MOVE_C])).toEqual(MOVE_A);
  });

  it('selectAiMove with ai-random picks move by random index deterministically', () => {
    const random = vi.fn<() => number>().mockReturnValue(0.51);
    const selected = selectAiMove('ai-random', [MOVE_A, MOVE_B, MOVE_C], random);

    expect(random).toHaveBeenCalledTimes(1);
    expect(selected).toEqual(MOVE_B);
  });

  it('selectAiMove clamps invalid random values', () => {
    const nanSelected = selectAiMove('ai-random', [MOVE_A, MOVE_B], () => Number.NaN);
    const highSelected = selectAiMove('ai-random', [MOVE_A, MOVE_B], () => Number.POSITIVE_INFINITY);
    const aboveOneSelected = selectAiMove('ai-random', [MOVE_A, MOVE_B], () => 2);

    expect(nanSelected).toEqual(MOVE_A);
    expect(highSelected).toEqual(MOVE_A);
    expect(aboveOneSelected).toEqual(MOVE_B);
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
