// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  completeMoveDecisionSequence,
  type MoveParamValue,
} from '../../src/kernel/index.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  assertEventText,
  assertNoOpEvent,
  countTokensInZone,
  findEventMove,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
  tokenIdsInZone,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-118';
const SPACE_A = 'tay-ninh:none';
const SPACE_B = 'binh-dinh:none';
const SPACE_C = 'quang-nam:none';

describe('FITL card-118 Korean War Arms', () => {
  // ─── Metadata & compilation ───

  it('compiles with correct text, metadata, and structural markers', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null, 'Expected valid GameDef');

    const def = compiled.gameDef!;
    const card = getEventCard(def, CARD_ID);

    assertEventText(def, CARD_ID, {
      title: 'Korean War Arms',
      unshaded: 'VC must remove 1 VC Guerrilla from each space with at least 2 and no NVA Base.',
      shaded: 'Place any 1 VC piece in each of 3 spaces.',
    });
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1964');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'ARVN', 'NVA', 'US']);

    const serializedUnshaded = JSON.stringify(card.unshaded?.effects ?? []);
    assert.match(serializedUnshaded, /"chooser":\{"id":3\}/, 'Unshaded guerrilla choice must be routed to VC (player 3)');
    assert.match(serializedUnshaded, /"value":"guerrilla"/, 'Unshaded should filter VC guerrillas');
    assert.match(serializedUnshaded, /"available-VC:none"/, 'Unshaded should move removed guerrillas to available');

    const serializedShaded = JSON.stringify(card.shaded?.effects ?? []);
    assert.match(serializedShaded, /"value":"base"/, 'Shaded should allow base placement');
    assert.match(serializedShaded, /"value":"guerrilla"/, 'Shaded should allow guerrilla placement');
    assert.match(serializedShaded, /"available-VC:none"/, 'Shaded should source pieces from VC available');
  });

  // ─── Unshaded tests ───

  it('unshaded removes 1 VC guerrilla from each qualifying space', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118001,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SPACE_A]: [
          makeFitlToken('kwa-a-vcg-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-a-vcg-2', 'guerrilla', 'VC', { activity: 'underground' }),
          makeFitlToken('kwa-a-vcg-3', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [SPACE_B]: [
          makeFitlToken('kwa-b-vcg-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeFitlToken('kwa-b-vcg-2', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-b-vcg-3', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    // Each space had 3 guerrillas, now should have 2
    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      2,
      'Space A should have 2 VC guerrillas after 1 removed',
    );
    assert.equal(
      countTokensInZone(final, SPACE_B, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      2,
      'Space B should have 2 VC guerrillas after 1 removed',
    );
    assert.equal(
      countTokensInZone(final, 'available-VC:none', (t) => t.type === 'guerrilla'),
      2,
      'Available should have 2 guerrillas (1 from each space)',
    );
  });

  it('unshaded lets VC choose Active over Underground for removal', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118002,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SPACE_A]: [
          makeFitlToken('kwa-choose-active', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-choose-ug', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    });

    const move = findEventMove(def, state, CARD_ID, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Korean War Arms unshaded move');

    // Use completeMoveDecisionSequence to verify chooser and pick active guerrilla
    const resolved = completeMoveDecisionSequence(def, state, move!, {
      choose: (request): MoveParamValue | undefined => {
        if (/^\$guerrillasToRemove@/u.test(request.name)) {
          // Verify VC is the chooser (player 3)
          assert.equal(request.decisionPlayer, asPlayerId(3), 'VC (player 3) must choose which guerrilla to remove');
          // chooseN requires array value
          return [asTokenId('kwa-choose-active')];
        }
        return undefined;
      },
    });
    assert.equal(resolved.complete, true, 'Decision sequence should complete');

    const final = applyMove(def, state, resolved.move).state;

    assert.equal(
      tokenIdsInZone(final, 'available-VC:none').has('kwa-choose-active'),
      true,
      'Active guerrilla should be removed (VC chose it)',
    );
    assert.equal(
      tokenIdsInZone(final, SPACE_A).has('kwa-choose-ug'),
      true,
      'Underground guerrilla should remain',
    );
  });

  it('unshaded excludes spaces with NVA bases', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118003,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SPACE_A]: [
          makeFitlToken('kwa-nvabase-vcg-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-nvabase-vcg-2', 'guerrilla', 'VC', { activity: 'underground' }),
          makeFitlToken('kwa-nvabase-vcg-3', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-nvabase-nvabase', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
        [SPACE_B]: [
          makeFitlToken('kwa-nonvabase-vcg-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-nonvabase-vcg-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    // Space A has NVA base → excluded, guerrillas unchanged
    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      3,
      'Space with NVA base should be excluded — all guerrillas remain',
    );
    // Space B qualifies → 1 removed
    assert.equal(
      countTokensInZone(final, SPACE_B, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
      'Space without NVA base should have 1 guerrilla removed',
    );
  });

  it('unshaded excludes spaces with fewer than 2 VC guerrillas', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118004,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SPACE_A]: [
          makeFitlToken('kwa-one-vcg', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [SPACE_B]: [
          makeFitlToken('kwa-two-vcg-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-two-vcg-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    // Space A has only 1 → excluded
    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
      'Space with 1 guerrilla should be excluded',
    );
    // Space B has exactly 2 → 1 removed
    assert.equal(
      countTokensInZone(final, SPACE_B, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
      'Space with exactly 2 guerrillas should have 1 removed',
    );
  });

  it('unshaded is a no-op when no spaces qualify', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118005,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SPACE_A]: [
          makeFitlToken('kwa-noop-vcg', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    assertNoOpEvent(def, state, CARD_ID, 'unshaded');
  });

  it('unshaded ignores NVA troops/guerrillas (only NVA bases block)', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118006,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SPACE_A]: [
          makeFitlToken('kwa-nvatroops-vcg-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-nvatroops-vcg-2', 'guerrilla', 'VC', { activity: 'underground' }),
          makeFitlToken('kwa-nvatroops-nvat', 'troops', 'NVA'),
          makeFitlToken('kwa-nvatroops-nvag', 'guerrilla', 'NVA', { activity: 'active' }),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
      'NVA troops/guerrillas should not block removal — only NVA bases',
    );
  });

  // ─── Shaded tests ───

  it('shaded places 1 VC guerrilla in each of 3 chosen spaces', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118010,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'available-VC:none': [
          makeFitlToken('kwa-sh-vcg-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-sh-vcg-2', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-sh-vcg-3', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-sh-vcg-4', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$koreanWarArmsShadedSpaces', resolvedBind: '$koreanWarArmsShadedSpaces' }),
        value: [SPACE_A, SPACE_B, SPACE_C],
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC'),
      1,
      'Space A should get 1 VC piece',
    );
    assert.equal(
      countTokensInZone(final, SPACE_B, (t) => t.props.faction === 'VC'),
      1,
      'Space B should get 1 VC piece',
    );
    assert.equal(
      countTokensInZone(final, SPACE_C, (t) => t.props.faction === 'VC'),
      1,
      'Space C should get 1 VC piece',
    );
    assert.equal(
      countTokensInZone(final, 'available-VC:none', (t) => t.props.faction === 'VC'),
      1,
      'Available should have 1 remaining VC piece',
    );
  });

  it('shaded allows base placement when bases available and stacking permits', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118011,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'available-VC:none': [
          makeFitlToken('kwa-sh-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('kwa-sh-guerr-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-sh-guerr-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = findEventMove(def, state, CARD_ID, 'shaded');
    assert.notEqual(move, undefined, 'Expected Korean War Arms shaded move');

    const resolved = completeMoveDecisionSequence(def, state, move!, {
      choose: (request): MoveParamValue | undefined => {
        if (request.name === '$koreanWarArmsShadedSpaces') {
          return [SPACE_A, SPACE_B, SPACE_C];
        }
        // First space: choose base
        if (/^\$kwaPieceType@/u.test(request.name) && request.name.includes(SPACE_A)) {
          return 'base';
        }
        // Other spaces: choose guerrilla (or fallback)
        if (/^\$kwaPieceType@/u.test(request.name)) {
          return 'guerrilla';
        }
        return undefined;
      },
    });
    assert.equal(resolved.complete, true, 'Shaded decision sequence should complete');

    const final = applyMove(def, state, resolved.move).state;

    // Space A should get the base
    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC' && t.type === 'base'),
      1,
      'Space A should receive a VC base',
    );
    // Space B should get a guerrilla
    assert.equal(
      countTokensInZone(final, SPACE_B, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
      'Space B should receive a VC guerrilla',
    );
  });

  it('shaded enforces base stacking limit of 2', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118012,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SPACE_A]: [
          makeFitlToken('kwa-stack-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('kwa-stack-base-2', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
        'available-VC:none': [
          makeFitlToken('kwa-stack-avail-base', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('kwa-stack-avail-guerr-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-stack-avail-guerr-2', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-stack-avail-guerr-3', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = findEventMove(def, state, CARD_ID, 'shaded');
    assert.notEqual(move, undefined, 'Expected Korean War Arms shaded move');

    // Use completeMoveDecisionSequence to verify Space A only offers guerrilla (stacking blocks base)
    const resolved = completeMoveDecisionSequence(def, state, move!, {
      choose: (request): MoveParamValue | undefined => {
        if (request.name === '$koreanWarArmsShadedSpaces') {
          return [SPACE_A, SPACE_B, SPACE_C];
        }
        // Space A already has 2 bases — if a pieceType choice is offered for Space A,
        // it should NOT include "base". But per our if-branching, the "both types" branch
        // won't fire because basesInSpace >= 2, so only the "guerrilla only" branch fires.
        // No chooseOne for pieceType should appear for Space A.
        if (/^\$kwaPieceType@/u.test(request.name)) {
          // If we get here for Space A, it means both types branch incorrectly fired
          if (request.name.includes(SPACE_A)) {
            assert.fail('Space A with 2 VC bases should not offer pieceType choice');
          }
          return 'guerrilla';
        }
        return undefined;
      },
    });
    assert.equal(resolved.complete, true, 'Shaded decision sequence should complete');

    const final = applyMove(def, state, resolved.move).state;

    // Space A should get a guerrilla (not a third base)
    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
      'Stacking-full space should receive guerrilla, not base',
    );
    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC' && t.type === 'base'),
      2,
      'Space A should still have exactly 2 VC bases',
    );
  });

  it('shaded clamps to fewer than 3 spaces when VC pieces depleted', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118013,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'available-VC:none': [
          makeFitlToken('kwa-dep-vcg-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-dep-vcg-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$koreanWarArmsShadedSpaces', resolvedBind: '$koreanWarArmsShadedSpaces' }),
        value: [SPACE_A, SPACE_B],
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    const totalPlaced = countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC')
      + countTokensInZone(final, SPACE_B, (t) => t.props.faction === 'VC');
    assert.equal(totalPlaced, 2, 'Only 2 spaces should receive pieces when only 2 available');
    assert.equal(
      countTokensInZone(final, 'available-VC:none', (t) => t.props.faction === 'VC'),
      0,
      'All available VC pieces should be placed',
    );
  });

  it('shaded is a no-op when 0 VC pieces available', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118014,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {},
    });

    assertNoOpEvent(def, state, CARD_ID, 'shaded');
  });

  it('shaded places guerrilla directly when only guerrillas available (no type choice)', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118015,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'available-VC:none': [
          makeFitlToken('kwa-gonly-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-gonly-2', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('kwa-gonly-3', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = findEventMove(def, state, CARD_ID, 'shaded');
    assert.notEqual(move, undefined);

    // Verify no pieceType choice is offered when only guerrillas available
    const resolved = completeMoveDecisionSequence(def, state, move!, {
      choose: (request): MoveParamValue | undefined => {
        if (request.name === '$koreanWarArmsShadedSpaces') {
          return [SPACE_A, SPACE_B, SPACE_C];
        }
        if (/^\$kwaPieceType@/u.test(request.name)) {
          assert.fail('No pieceType choice should be offered when only guerrillas are available');
        }
        return undefined;
      },
    });
    assert.equal(resolved.complete, true);

    const final = applyMove(def, state, resolved.move).state;

    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
    );
    assert.equal(
      countTokensInZone(final, SPACE_B, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
    );
    assert.equal(
      countTokensInZone(final, SPACE_C, (t) => t.props.faction === 'VC' && t.type === 'guerrilla'),
      1,
    );
  });

  it('shaded places base directly when only bases available and stacking OK', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 118016,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        'available-VC:none': [
          makeFitlToken('kwa-bonly-1', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('kwa-bonly-2', 'base', 'VC', { tunnel: 'untunneled' }),
          makeFitlToken('kwa-bonly-3', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
    });

    const move = findEventMove(def, state, CARD_ID, 'shaded');
    assert.notEqual(move, undefined);

    const resolved = completeMoveDecisionSequence(def, state, move!, {
      choose: (request): MoveParamValue | undefined => {
        if (request.name === '$koreanWarArmsShadedSpaces') {
          return [SPACE_A, SPACE_B, SPACE_C];
        }
        if (/^\$kwaPieceType@/u.test(request.name)) {
          assert.fail('No pieceType choice should be offered when only bases are available');
        }
        return undefined;
      },
    });
    assert.equal(resolved.complete, true);

    const final = applyMove(def, state, resolved.move).state;

    assert.equal(
      countTokensInZone(final, SPACE_A, (t) => t.props.faction === 'VC' && t.type === 'base'),
      1,
    );
    assert.equal(
      countTokensInZone(final, SPACE_B, (t) => t.props.faction === 'VC' && t.type === 'base'),
      1,
    );
    assert.equal(
      countTokensInZone(final, SPACE_C, (t) => t.props.faction === 'VC' && t.type === 'base'),
      1,
    );
  });
});
