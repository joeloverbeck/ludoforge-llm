// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  legalChoicesEvaluate,
  type MoveParamValue,
} from '../../src/kernel/index.js';
import { completeMoveDecisionSequence } from '../helpers/complete-move-decision-sequence.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  assertEventText,
  assertNoOpEvent,
  countTokensInZone,
  findEventMove,
  findTokenInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
  tokenIdsInZone,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-84';
const SOUTH_A = 'hue:none';
const SOUTH_B = 'tay-ninh:none';
const SOUTH_C = 'binh-dinh:none';
const SOUTH_D = 'kien-phong:none';
const SOUTH_E = 'quang-nam:none';
const OUTSIDE_SOUTH = 'central-laos:none';

describe('FITL card-84 To Quoc', () => {
  it('compiles exact text and keeps the South-Vietnam placement plus ARVN-owned shaded removal logic explicit', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null, 'Expected valid GameDef');

    const def = compiled.gameDef!;
    const card = getEventCard(def, CARD_ID);

    assertEventText(def, CARD_ID, {
      title: 'To Quoc',
      unshaded: 'Place 1 ARVN Troop and 1 Police in each South Vietnam space with NVA.',
      shaded: 'ARVN remove 1 in 3 cubes (round down) each space. Place a VC Guerrilla in 3 spaces where ARVN removed.',
    });
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1968');
    assert.deepEqual(card.metadata?.seatOrder, ['ARVN', 'VC', 'US', 'NVA']);

    const serializedUnshaded = JSON.stringify(card.unshaded?.effects ?? []);
    assert.match(serializedUnshaded, /"prop":"country".*"right":"southVietnam"/, 'Unshaded should restrict placements to South Vietnam');
    assert.match(serializedUnshaded, /"prop":"faction".*"value":"NVA"/, 'Unshaded should require NVA presence');
    assert.match(serializedUnshaded, /"value":"troops"/, 'Unshaded should place ARVN troops');
    assert.match(serializedUnshaded, /"value":"police"/, 'Unshaded should place ARVN police');

    const serializedShaded = JSON.stringify(card.shaded?.effects ?? []);
    assert.match(serializedShaded, /"chooser":\{"id":1\}/, 'Shaded cube-removal choices must belong to ARVN');
    assert.match(serializedShaded, /"available-VC:none"/, 'Shaded should source VC guerrillas from Available');
    assert.match(serializedShaded, /"value":"guerrilla"/, 'Shaded should place VC guerrillas');
    assert.match(serializedShaded, /"value":"underground"/, 'Shaded should place new VC guerrillas underground');
  });

  it('unshaded places 1 ARVN troop and 1 police in each South Vietnam space with NVA only', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 84001,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SOUTH_A]: [makeFitlToken('to-quoc-a-nva', 'troops', 'NVA')],
        [SOUTH_B]: [makeFitlToken('to-quoc-b-nva', 'base', 'NVA', { tunnel: 'untunneled' })],
        [SOUTH_C]: [makeFitlToken('to-quoc-c-vc', 'guerrilla', 'VC', { activity: 'underground' })],
        [OUTSIDE_SOUTH]: [makeFitlToken('to-quoc-laos-nva', 'troops', 'NVA')],
        'available-ARVN:none': [
          makeFitlToken('to-quoc-troop-1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-troop-2', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-police-1', 'police', 'ARVN'),
          makeFitlToken('to-quoc-police-2', 'police', 'ARVN'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded').state;

    assert.equal(countTokensInZone(final, SOUTH_A, (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 1);
    assert.equal(countTokensInZone(final, SOUTH_A, (token) => token.props.faction === 'ARVN' && token.type === 'police'), 1);
    assert.equal(countTokensInZone(final, SOUTH_B, (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 1);
    assert.equal(countTokensInZone(final, SOUTH_B, (token) => token.props.faction === 'ARVN' && token.type === 'police'), 1);
    assert.equal(countTokensInZone(final, SOUTH_C, (token) => token.props.faction === 'ARVN'), 0, 'South spaces without NVA must not gain ARVN pieces');
    assert.equal(countTokensInZone(final, OUTSIDE_SOUTH, (token) => token.props.faction === 'ARVN'), 0, 'Outside-South spaces must not gain ARVN pieces');
    assert.equal(countTokensInZone(final, 'available-ARVN:none', (token) => token.props.faction === 'ARVN'), 0);
  });

  it('unshaded lets the executing faction allocate limited troops and police independently across eligible spaces', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 84002,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SOUTH_A]: [makeFitlToken('to-quoc-scarce-nva-a', 'troops', 'NVA')],
        [SOUTH_B]: [makeFitlToken('to-quoc-scarce-nva-b', 'troops', 'NVA')],
        [SOUTH_C]: [makeFitlToken('to-quoc-scarce-nva-c', 'troops', 'NVA')],
        'available-ARVN:none': [
          makeFitlToken('to-quoc-scarce-troop', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-scarce-police-1', 'police', 'ARVN'),
          makeFitlToken('to-quoc-scarce-police-2', 'police', 'ARVN'),
        ],
      },
    });

    const move = findEventMove(def, state, CARD_ID, 'unshaded');
    assert.notEqual(move, undefined, 'Expected To Quoc unshaded move');

    const pending = legalChoicesEvaluate(def, state, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending troop-space selection when To Quoc unshaded lacks enough ARVN pieces.');
    }
    assert.equal(pending.decisionPlayer, undefined, 'Default executor-owned choices should not set an explicit decisionPlayer override');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$toQuocTroopPlacementSpaces', resolvedBind: '$toQuocTroopPlacementSpaces' }),
        value: [SOUTH_B],
      },
      {
        when: matchesDecisionRequest({ name: '$toQuocPolicePlacementSpaces', resolvedBind: '$toQuocPolicePlacementSpaces' }),
        value: [SOUTH_A, SOUTH_C],
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'unshaded', { overrides }).state;

    assert.equal(tokenIdsInZone(final, SOUTH_B).has('to-quoc-scarce-troop'), true, 'Selected troop space should receive the only troop');
    assert.equal(tokenIdsInZone(final, SOUTH_A).has('to-quoc-scarce-troop'), false);
    assert.equal(tokenIdsInZone(final, SOUTH_C).has('to-quoc-scarce-troop'), false);
    assert.equal(tokenIdsInZone(final, SOUTH_A).has('to-quoc-scarce-police-1'), true, 'Selected police spaces should receive police');
    assert.equal(tokenIdsInZone(final, SOUTH_C).has('to-quoc-scarce-police-2'), true, 'Selected police spaces should receive police');
    assert.equal(tokenIdsInZone(final, SOUTH_B).has('to-quoc-scarce-police-1'), false, 'Police placement choice should remain independent from troop placement choice');
  });

  it('shaded routes cube-removal choices to ARVN and VC-placement choices to the executor, then applies the chosen removals and placements', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 84003,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SOUTH_A]: [
          makeFitlToken('to-quoc-a-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-a-t2', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-a-p1', 'police', 'ARVN'),
          makeFitlToken('to-quoc-a-p2', 'police', 'ARVN'),
        ],
        [SOUTH_B]: [
          makeFitlToken('to-quoc-b-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-b-t2', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-b-p1', 'police', 'ARVN'),
        ],
        [SOUTH_C]: [
          makeFitlToken('to-quoc-c-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-c-t2', 'troops', 'ARVN'),
        ],
        [SOUTH_D]: [
          makeFitlToken('to-quoc-d-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-d-t2', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-d-p1', 'police', 'ARVN'),
        ],
        [SOUTH_E]: [
          makeFitlToken('to-quoc-e-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-e-t2', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-e-p1', 'police', 'ARVN'),
        ],
        'available-VC:none': [
          makeFitlToken('to-quoc-vc-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('to-quoc-vc-2', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('to-quoc-vc-3', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = findEventMove(def, state, CARD_ID, 'shaded');
    assert.notEqual(move, undefined, 'Expected To Quoc shaded move');

    const resolved = completeMoveDecisionSequence(def, state, move!, {
      choose: (request): MoveParamValue | undefined => {
        if (request.name === '$toQuocSpacesWhereArvnRemoves') {
          assert.equal(request.decisionPlayer, undefined, 'Default executor-owned pre-removal space snapshot should not set an explicit decisionPlayer override');
          return request.options.map((option) => String(option.value));
        }

        if (/^\$toQuocCubesToRemove@/u.test(request.name)) {
          assert.equal(request.decisionPlayer, asPlayerId(1), 'ARVN must choose the shaded cube removals');
          if (request.name === `$toQuocCubesToRemove@${SOUTH_A}`) {
            return [asTokenId('to-quoc-a-p2')];
          }
          if (request.name === `$toQuocCubesToRemove@${SOUTH_B}`) {
            return [asTokenId('to-quoc-b-p1')];
          }
          if (request.name === `$toQuocCubesToRemove@${SOUTH_D}`) {
            return [asTokenId('to-quoc-d-t1')];
          }
          if (request.name === `$toQuocCubesToRemove@${SOUTH_E}`) {
            return [asTokenId('to-quoc-e-t2')];
          }
        }

        if (request.name === '$toQuocVcPlacementSpaces') {
          assert.equal(request.decisionPlayer, undefined, 'Default executor-owned placement choice should not set an explicit decisionPlayer override');
          return [SOUTH_A, SOUTH_D, SOUTH_E];
        }

        if (/^\$toQuocVcGuerrilla@/u.test(request.name)) {
          assert.equal(request.decisionPlayer, undefined, 'Default executor-owned token picks should not set an explicit decisionPlayer override');
          return [String(request.options[0]?.value)];
        }

        return undefined;
      },
    });
    assert.equal(resolved.complete, true, 'Expected shaded To Quoc decision sequence to complete');

    const final = applyMove(def, state, resolved.move).state;

    assert.equal(tokenIdsInZone(final, 'available-ARVN:none').has('to-quoc-a-p2'), true);
    assert.equal(tokenIdsInZone(final, 'available-ARVN:none').has('to-quoc-b-p1'), true);
    assert.equal(tokenIdsInZone(final, 'available-ARVN:none').has('to-quoc-d-t1'), true);
    assert.equal(tokenIdsInZone(final, 'available-ARVN:none').has('to-quoc-e-t2'), true);
    assert.equal(tokenIdsInZone(final, SOUTH_C).has('to-quoc-c-t1'), true, 'Spaces with fewer than 3 cubes must be untouched');
    assert.equal(tokenIdsInZone(final, SOUTH_B).has('to-quoc-vc-1'), false, 'Unselected removal spaces must not receive VC placement');
    assert.equal(findTokenInZone(final, SOUTH_A, 'to-quoc-vc-1')?.props.activity, 'underground');
    assert.equal(findTokenInZone(final, SOUTH_D, 'to-quoc-vc-2')?.props.activity, 'underground');
    assert.equal(findTokenInZone(final, SOUTH_E, 'to-quoc-vc-3')?.props.activity, 'underground');
  });

  it('shaded still removes cubes in every eligible space but clamps VC placement by available guerrillas', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 84004,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SOUTH_A]: [
          makeFitlToken('to-quoc-clamp-a-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-clamp-a-t2', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-clamp-a-p1', 'police', 'ARVN'),
        ],
        [SOUTH_B]: [
          makeFitlToken('to-quoc-clamp-b-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-clamp-b-t2', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-clamp-b-p1', 'police', 'ARVN'),
        ],
        [SOUTH_D]: [
          makeFitlToken('to-quoc-clamp-d-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-clamp-d-t2', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-clamp-d-p1', 'police', 'ARVN'),
        ],
        'available-VC:none': [makeFitlToken('to-quoc-clamp-vc-1', 'guerrilla', 'VC', { activity: 'active' })],
      },
    });

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$toQuocSpacesWhereArvnRemoves', resolvedBind: '$toQuocSpacesWhereArvnRemoves' }),
        value: (request) => request.options.map((option) => String(option.value)),
      },
      {
        when: matchesDecisionRequest({ namePattern: /^\$toQuocCubesToRemove@/u, resolvedBindPattern: /^\$toQuocCubesToRemove@/u }),
        value: (request) => [String(request.options[0]?.value)],
      },
      {
        when: matchesDecisionRequest({ name: '$toQuocVcPlacementSpaces', resolvedBind: '$toQuocVcPlacementSpaces' }),
        value: [SOUTH_B],
      },
      {
        when: matchesDecisionRequest({ namePattern: /^\$toQuocVcGuerrilla@/u, resolvedBindPattern: /^\$toQuocVcGuerrilla@/u, type: 'chooseN' }),
        value: (request) => [String(request.options[0]?.value)],
      },
    ];
    const final = runEvent(def, state, CARD_ID, 'shaded', { overrides }).state;

    assert.equal(tokenIdsInZone(final, 'available-ARVN:none').has('to-quoc-clamp-a-t1'), true);
    assert.equal(tokenIdsInZone(final, 'available-ARVN:none').has('to-quoc-clamp-b-t1'), true);
    assert.equal(tokenIdsInZone(final, 'available-ARVN:none').has('to-quoc-clamp-d-t1'), true);
    assert.equal(findTokenInZone(final, SOUTH_B, 'to-quoc-clamp-vc-1')?.props.activity, 'underground');
    assert.equal(tokenIdsInZone(final, SOUTH_A).has('to-quoc-clamp-vc-1'), false);
    assert.equal(tokenIdsInZone(final, SOUTH_D).has('to-quoc-clamp-vc-1'), false);
  });

  it('shaded is a legal no-op when no space has at least 3 ARVN cubes', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 84005,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [SOUTH_A]: [
          makeFitlToken('to-quoc-noop-a-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-noop-a-p1', 'police', 'ARVN'),
        ],
        [SOUTH_B]: [
          makeFitlToken('to-quoc-noop-b-t1', 'troops', 'ARVN'),
          makeFitlToken('to-quoc-noop-b-p1', 'police', 'ARVN'),
        ],
        'available-VC:none': [makeFitlToken('to-quoc-noop-vc', 'guerrilla', 'VC', { activity: 'active' })],
      },
    });

    assertNoOpEvent(def, state, CARD_ID, 'shaded');
  });
});
