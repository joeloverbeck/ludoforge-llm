import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { familyKey, abstractMoveKey } from '../../../../src/agents/mcts/move-key.js';
import {
  initClassificationEntry,
  getRepresentedFamilies,
  countByFamily,
} from '../../../../src/agents/mcts/state-cache.js';
import type { Move } from '../../../../src/kernel/types-core.js';
import type { TurnFlowActionClass } from '../../../../src/contracts/turn-flow-action-class-contract.js';
import { asActionId } from '../../../../src/kernel/branded.js';

const aid = asActionId;

// ---------------------------------------------------------------------------
// familyKey
// ---------------------------------------------------------------------------

describe('familyKey', () => {
  it('groups moves with same actionId but different params', () => {
    const moveA: Move = { actionId: aid('rally'), params: { zone: 'saigon' } };
    const moveB: Move = { actionId: aid('rally'), params: { zone: 'hue' } };
    assert.equal(familyKey(moveA), familyKey(moveB));
  });

  it('separates moves with different actionIds', () => {
    const moveA: Move = { actionId: aid('rally'), params: { zone: 'saigon' } };
    const moveB: Move = { actionId: aid('march'), params: { zone: 'saigon' } };
    assert.notEqual(familyKey(moveA), familyKey(moveB));
  });

  it('returns the actionId as the key', () => {
    const move: Move = { actionId: aid('attack'), params: { target: 'zone1' } };
    assert.equal(familyKey(move), 'attack');
  });

  it('groups compound moves by actionId', () => {
    const moveA: Move = {
      actionId: aid('transfer'),
      params: { amount: 1 },
      compound: {
        specialActivity: { actionId: aid('extort'), params: {} },
        timing: 'before' as const,
      },
    };
    const moveB: Move = {
      actionId: aid('transfer'),
      params: { amount: 5 },
      compound: {
        specialActivity: { actionId: aid('govern'), params: {} },
        timing: 'after' as const,
      },
    };
    assert.equal(familyKey(moveA), familyKey(moveB));
  });
});

// ---------------------------------------------------------------------------
// abstractMoveKey
// ---------------------------------------------------------------------------

describe('abstractMoveKey', () => {
  it('returns actionClass when provided', () => {
    const move: Move = { actionId: aid('rally'), params: {} };
    const ac: TurnFlowActionClass = 'operation';
    assert.equal(abstractMoveKey(move, ac), 'operation');
  });

  it('falls back to actionId when no actionClass', () => {
    const move: Move = { actionId: aid('rally'), params: {} };
    assert.equal(abstractMoveKey(move), 'rally');
    assert.equal(abstractMoveKey(move, undefined), 'rally');
  });

  it('is coarser than familyKey when actionClass is provided', () => {
    const moveA: Move = { actionId: aid('rally'), params: {} };
    const moveB: Move = { actionId: aid('march'), params: {} };
    // Different familyKeys
    assert.notEqual(familyKey(moveA), familyKey(moveB));
    // Same abstractMoveKey when both are operations
    assert.equal(
      abstractMoveKey(moveA, 'operation'),
      abstractMoveKey(moveB, 'operation'),
    );
  });
});

// ---------------------------------------------------------------------------
// CachedLegalMoveInfo.familyKey population
// ---------------------------------------------------------------------------

describe('initClassificationEntry familyKey population', () => {
  it('populates familyKey on each CachedLegalMoveInfo', () => {
    const moves: Move[] = [
      { actionId: aid('rally'), params: { zone: 'saigon' } },
      { actionId: aid('rally'), params: { zone: 'hue' } },
      { actionId: aid('march'), params: { zone: 'danang' } },
    ];
    const entry = initClassificationEntry(moves);
    for (const info of entry.infos) {
      assert.equal(typeof info.familyKey, 'string');
      assert.equal(info.familyKey, info.move.actionId);
    }
  });

  it('deduplicates by moveKey but preserves familyKey', () => {
    const moves: Move[] = [
      { actionId: aid('rally'), params: { zone: 'saigon' } },
      { actionId: aid('rally'), params: { zone: 'saigon' } }, // duplicate
    ];
    const entry = initClassificationEntry(moves);
    assert.equal(entry.infos.length, 1);
    assert.equal(entry.infos[0]!.familyKey, 'rally');
  });
});

// ---------------------------------------------------------------------------
// getRepresentedFamilies
// ---------------------------------------------------------------------------

describe('getRepresentedFamilies', () => {
  it('returns unique family keys', () => {
    const moves: Move[] = [
      { actionId: aid('rally'), params: { zone: 'saigon' } },
      { actionId: aid('rally'), params: { zone: 'hue' } },
      { actionId: aid('march'), params: { zone: 'danang' } },
      { actionId: aid('attack'), params: { target: 'zone1' } },
    ];
    const entry = initClassificationEntry(moves);
    const families = getRepresentedFamilies(entry);
    assert.deepEqual(families, new Set(['rally', 'march', 'attack']));
  });

  it('returns empty set for empty entry', () => {
    const entry = initClassificationEntry([]);
    assert.deepEqual(getRepresentedFamilies(entry), new Set());
  });
});

// ---------------------------------------------------------------------------
// countByFamily
// ---------------------------------------------------------------------------

describe('countByFamily', () => {
  it('returns correct counts per family', () => {
    const moves: Move[] = [
      { actionId: aid('rally'), params: { zone: 'saigon' } },
      { actionId: aid('rally'), params: { zone: 'hue' } },
      { actionId: aid('rally'), params: { zone: 'danang' } },
      { actionId: aid('march'), params: { zone: 'saigon' } },
      { actionId: aid('attack'), params: { target: 'zone1' } },
    ];
    const entry = initClassificationEntry(moves);
    const counts = countByFamily(entry);
    assert.equal(counts.get('rally'), 3);
    assert.equal(counts.get('march'), 1);
    assert.equal(counts.get('attack'), 1);
  });

  it('returns empty map for empty entry', () => {
    const entry = initClassificationEntry([]);
    assert.equal(countByFamily(entry).size, 0);
  });
});
