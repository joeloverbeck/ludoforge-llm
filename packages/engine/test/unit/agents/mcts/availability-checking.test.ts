/**
 * Tests for sound availability checking in MCTS selection (64MCTSPEROPT-003).
 *
 * Verifies that selection correctly distinguishes known available, unknown,
 * and known unavailable children using CachedClassificationEntry statuses.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  type CachedClassificationEntry,
  type CachedLegalMoveInfo,
  type ClassificationStatus,
} from '../../../../src/agents/mcts/state-cache.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';
import {
  filterAvailableByClassification,
} from '../../../../src/agents/mcts/availability.js';
import { validateMctsConfig } from '../../../../src/agents/mcts/config.js';
import { asActionId } from '../../../../src/kernel/index.js';
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMove(actionId: string, params: Record<string, number> = {}): Move {
  return { actionId: asActionId(actionId), params };
}

function makeMoveKey(actionId: string, params: Record<string, number> = {}): MoveKey {
  const parts = [actionId];
  for (const [k, v] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`${k}=${v}`);
  }
  return parts.join('|') as MoveKey;
}

function makeMockChild(
  moveKey: MoveKey,
  nodeKind: 'state' | 'decision' = 'state',
  visits = 0,
): MctsNode {
  return {
    move: makeMove(moveKey.split('|')[0]!),
    moveKey,
    parent: null,
    children: [],
    visits,
    availability: 0,
    totalReward: [0, 0],
    nodeKind,
    decisionPlayer: null,
    partialMove: null,
    decisionBinding: null,
    decisionType: null,
    provenResult: null,
    heuristicPrior: null,
  } as unknown as MctsNode;
}

function makeCachedInfo(
  moveKey: MoveKey,
  status: ClassificationStatus,
): CachedLegalMoveInfo {
  const move = makeMove(moveKey.split('|')[0]!);
  return {
    move,
    moveKey,
    familyKey: move.actionId,
    status,
  };
}

function makeClassificationEntry(
  infos: CachedLegalMoveInfo[],
  exhaustive = false,
): CachedClassificationEntry {
  let cursor = 0;
  for (const info of infos) {
    if (info.status === 'unknown') break;
    cursor += 1;
  }
  return {
    infos,
    nextUnclassifiedCursor: cursor,
    exhaustiveScanComplete: exhaustive,
  };
}

// ---------------------------------------------------------------------------
// filterAvailableByClassification
// ---------------------------------------------------------------------------

describe('filterAvailableByClassification', () => {
  it('AC 1: child with ready status is available', () => {
    const key = makeMoveKey('noop');
    const child = makeMockChild(key);
    const entry = makeClassificationEntry([makeCachedInfo(key, 'ready')], true);

    const result = filterAvailableByClassification([child], entry);

    assert.equal(result.available.length, 1);
    assert.strictEqual(result.available[0], child);
    assert.equal(result.unknown.length, 0);
  });

  it('AC 2: child with illegal status is skipped', () => {
    const key = makeMoveKey('noop');
    const child = makeMockChild(key);
    const entry = makeClassificationEntry([makeCachedInfo(key, 'illegal')], true);

    const result = filterAvailableByClassification([child], entry);

    assert.equal(result.available.length, 0);
    assert.equal(result.unknown.length, 0);
  });

  it('AC 3: child with pendingStochastic status is skipped', () => {
    const key = makeMoveKey('noop');
    const child = makeMockChild(key);
    const entry = makeClassificationEntry(
      [makeCachedInfo(key, 'pendingStochastic')],
      true,
    );

    const result = filterAvailableByClassification([child], entry);

    assert.equal(result.available.length, 0);
    assert.equal(result.unknown.length, 0);
  });

  it('AC 4: child with unknown status is flagged for on-demand classification', () => {
    const key = makeMoveKey('noop');
    const child = makeMockChild(key);
    const entry = makeClassificationEntry([makeCachedInfo(key, 'unknown')]);

    const result = filterAvailableByClassification([child], entry);

    assert.equal(result.available.length, 0);
    assert.equal(result.unknown.length, 1);
    assert.deepStrictEqual(result.unknown[0], { child, infoIndex: 0 });
  });

  it('AC 5: pending child (decision root) is available', () => {
    const key = makeMoveKey('choose');
    const child = makeMockChild(key, 'decision');
    const entry = makeClassificationEntry([makeCachedInfo(key, 'pending')], true);

    const result = filterAvailableByClassification([child], entry);

    assert.equal(result.available.length, 1);
    assert.strictEqual(result.available[0], child);
  });

  it('mixed statuses partition correctly', () => {
    const readyKey = makeMoveKey('ready');
    const illegalKey = makeMoveKey('illegal');
    const unknownKey = makeMoveKey('unknown');
    const pendingKey = makeMoveKey('pending');
    const stochasticKey = makeMoveKey('stochastic');

    const children = [
      makeMockChild(readyKey),
      makeMockChild(illegalKey),
      makeMockChild(unknownKey),
      makeMockChild(pendingKey, 'decision'),
      makeMockChild(stochasticKey),
    ];

    const entry = makeClassificationEntry([
      makeCachedInfo(readyKey, 'ready'),
      makeCachedInfo(illegalKey, 'illegal'),
      makeCachedInfo(unknownKey, 'unknown'),
      makeCachedInfo(pendingKey, 'pending'),
      makeCachedInfo(stochasticKey, 'pendingStochastic'),
    ]);

    const result = filterAvailableByClassification(children, entry);

    assert.equal(result.available.length, 2, 'ready + pending');
    assert.equal(result.unknown.length, 1, 'one unknown');
    // Implicitly: illegal + pendingStochastic are neither available nor unknown
  });

  it('child whose moveKey is absent from classification entry is skipped', () => {
    const key = makeMoveKey('orphan');
    const child = makeMockChild(key);
    const entry = makeClassificationEntry([], true);

    const result = filterAvailableByClassification([child], entry);

    assert.equal(result.available.length, 0);
    assert.equal(result.unknown.length, 0);
  });

  it('increments availability only for available children', () => {
    const readyKey = makeMoveKey('ready');
    const illegalKey = makeMoveKey('illegal');

    const readyChild = makeMockChild(readyKey);
    const illegalChild = makeMockChild(illegalKey);

    const entry = makeClassificationEntry([
      makeCachedInfo(readyKey, 'ready'),
      makeCachedInfo(illegalKey, 'illegal'),
    ], true);

    filterAvailableByClassification([readyChild, illegalChild], entry);

    assert.equal(readyChild.availability, 1, 'ready child availability incremented');
    assert.equal(illegalChild.availability, 0, 'illegal child availability unchanged');
  });
});

// ---------------------------------------------------------------------------
// classificationPolicy config
// ---------------------------------------------------------------------------

describe('classificationPolicy config validation', () => {
  it('AC 6: default classificationPolicy is undefined (auto)', () => {
    const config = validateMctsConfig({});
    assert.equal(config.classificationPolicy, undefined);
  });

  it('accepts exhaustive policy', () => {
    const config = validateMctsConfig({ classificationPolicy: 'exhaustive' });
    assert.equal(config.classificationPolicy, 'exhaustive');
  });

  it('accepts lazy policy', () => {
    const config = validateMctsConfig({ classificationPolicy: 'lazy' });
    assert.equal(config.classificationPolicy, 'lazy');
  });

  it('accepts auto policy', () => {
    const config = validateMctsConfig({ classificationPolicy: 'auto' });
    assert.equal(config.classificationPolicy, 'auto');
  });

  it('rejects invalid classificationPolicy', () => {
    assert.throws(
      () => validateMctsConfig({ classificationPolicy: 'bogus' as 'auto' }),
      (err: unknown) =>
        err instanceof TypeError &&
        /classificationPolicy/.test((err as TypeError).message),
    );
  });
});
