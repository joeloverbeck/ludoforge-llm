import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildForEachTraceEntry, buildReduceTraceEntry } from '../../src/kernel/control-flow-trace.js';

describe('control-flow trace builders', () => {
  const provenance = {
    phase: 'main',
    eventContext: 'actionEffect',
    actionId: 'play',
    effectPath: 'action:play.effects[0]',
  } as const;

  it('buildForEachTraceEntry omits limit when not explicitly configured', () => {
    const entry = buildForEachTraceEntry({
      bind: '$item',
      matchCount: 3,
      iteratedCount: 3,
      explicitLimit: false,
      resolvedLimit: 100,
      provenance,
    });

    assert.deepEqual(entry, {
      kind: 'forEach',
      bind: '$item',
      matchCount: 3,
      iteratedCount: 3,
      provenance,
    });
  });

  it('buildForEachTraceEntry includes resolved limit when explicitly configured', () => {
    const entry = buildForEachTraceEntry({
      bind: '$item',
      matchCount: 10,
      iteratedCount: 2,
      explicitLimit: true,
      resolvedLimit: 2,
      provenance,
    });

    assert.deepEqual(entry, {
      kind: 'forEach',
      bind: '$item',
      matchCount: 10,
      iteratedCount: 2,
      limit: 2,
      provenance,
    });
  });

  it('buildForEachTraceEntry includes macroOrigin when provided', () => {
    const entry = buildForEachTraceEntry({
      bind: '$__macro_collect_forced_bets_path_player',
      macroOrigin: { macroId: 'collect-forced-bets', stem: 'player' },
      matchCount: 2,
      iteratedCount: 2,
      explicitLimit: false,
      resolvedLimit: 100,
      provenance,
    });

    assert.deepEqual(entry, {
      kind: 'forEach',
      bind: '$__macro_collect_forced_bets_path_player',
      macroOrigin: { macroId: 'collect-forced-bets', stem: 'player' },
      matchCount: 2,
      iteratedCount: 2,
      provenance,
    });
  });

  it('buildReduceTraceEntry omits limit when not explicitly configured', () => {
    const entry = buildReduceTraceEntry({
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$sum',
      matchCount: 4,
      iteratedCount: 4,
      explicitLimit: false,
      resolvedLimit: 100,
      provenance,
    });

    assert.deepEqual(entry, {
      kind: 'reduce',
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$sum',
      matchCount: 4,
      iteratedCount: 4,
      provenance,
    });
  });

  it('buildReduceTraceEntry includes resolved limit when explicitly configured', () => {
    const entry = buildReduceTraceEntry({
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$sum',
      matchCount: 7,
      iteratedCount: 3,
      explicitLimit: true,
      resolvedLimit: 3,
      provenance,
    });

    assert.deepEqual(entry, {
      kind: 'reduce',
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$sum',
      matchCount: 7,
      iteratedCount: 3,
      limit: 3,
      provenance,
    });
  });

  it('buildReduceTraceEntry includes binder-specific macro origins when provided', () => {
    const entry = buildReduceTraceEntry({
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$__macro_hand_rank_score_path_straightHigh',
      itemMacroOrigin: { macroId: 'hand-rank-score', stem: 'n' },
      accMacroOrigin: { macroId: 'hand-rank-score', stem: 'acc' },
      resultMacroOrigin: { macroId: 'hand-rank-score', stem: 'straightHigh' },
      matchCount: 5,
      iteratedCount: 5,
      explicitLimit: false,
      resolvedLimit: 100,
      provenance,
    });

    assert.deepEqual(entry, {
      kind: 'reduce',
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$__macro_hand_rank_score_path_straightHigh',
      itemMacroOrigin: { macroId: 'hand-rank-score', stem: 'n' },
      accMacroOrigin: { macroId: 'hand-rank-score', stem: 'acc' },
      resultMacroOrigin: { macroId: 'hand-rank-score', stem: 'straightHigh' },
      matchCount: 5,
      iteratedCount: 5,
      provenance,
    });
  });
});
