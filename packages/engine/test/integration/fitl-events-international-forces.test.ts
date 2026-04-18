// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  completeMoveDecisionSequence,
  createRng,
  initialState,
  legalChoicesEvaluate,
  legalMoves,
  nextInt,
  resolveMoveDecisionSequence,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamScalar,
  type MoveParamValue,
  type Token,
} from '../../src/kernel/index.js';
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-65';
const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const HUE_DA_NANG_LOC = 'loc-hue-da-nang:none';
const CENTRAL_LAOS = 'central-laos:none';
const DA_NANG = 'da-nang:none';
const NORTH_VIETNAM = 'north-vietnam:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extras: Readonly<Record<string, string | number | boolean>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extras,
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupState = (
  def: GameDef,
  seed: number,
  activePlayer: 0 | 1 | 2 | 3,
  zones: Readonly<Record<string, readonly Token[]>>,
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    turnOrderState: { type: 'roundRobin' },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...zones,
    },
  };
};

const findCardMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countMatching = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const tokenIds = (state: GameState, zone: string): string[] =>
  (state.zones[zone] ?? []).map((token) => String((token as Token).id));

const countPattern = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

describe('FITL card-65 International Forces', () => {
  it('encodes exact text, legal-map placement constraints, and the compact shaded chooseN form', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined, 'Expected card-65 in production deck');

    assert.equal(card?.title, 'International Forces');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'US', 'NVA', 'VC']);
    assert.equal(card?.metadata?.flavorText, 'Free World allies.');
    assert.equal(card?.unshaded?.text, 'Place 4 out-of-play US pieces onto the map.');
    assert.equal(card?.shaded?.text, 'US must remove a die roll in pieces from the map to out of play.');

    const unshadedText = JSON.stringify(card?.unshaded?.effects ?? []);
    assert.match(unshadedText, /"bind":"\$internationalForcesUsPieces"/);
    assert.match(unshadedText, /"zone":"out-of-play-US:none"/);
    assert.match(unshadedText, /"prop":"country".*"right":"northVietnam"/);
    assert.match(unshadedText, /"prop":"type".*"value":"base"/);
    assert.match(unshadedText, /"right":2/);

    const shadedText = JSON.stringify(card?.shaded?.effects ?? []);
    assert.match(shadedText, /"bind":"\$internationalForcesRemovalRoll"/);
    assert.match(shadedText, /"bind":"\$internationalForcesPiecesToRemove"/);
    assert.match(shadedText, /"bind":"\$internationalForcesUsMapPieces"/);
    assert.match(shadedText, /"chooser":\{"id":0\}/);
    assert.match(shadedText, /"query":"tokensInMapSpaces"/);
    assert.match(shadedText, /"min":\{"ref":"binding","name":"\$internationalForcesPiecesToRemove","_t":2\}/);
    assert.match(shadedText, /"max":\{"ref":"binding","name":"\$internationalForcesPiecesToRemove","_t":2\}/);
    assert.match(shadedText, /"zoneExpr":"out-of-play-US:none"/);
    assert.equal(
      countPattern(shadedText, /"bind":"\$internationalForcesUsMapPieces"/g),
      1,
      'Shaded should author one chooser-owned chooseN instead of a per-count branch ladder',
    );
  });

  it('unshaded excludes North Vietnam and full 2-base spaces from destination choices for out-of-play US bases', () => {
    const def = compileDef();
    const setup = setupState(def, 65001, 1, {
      'out-of-play-US:none': [makeToken('if-base', 'base', 'US')],
      [HUE]: [makeToken('if-hue-existing-base', 'base', 'ARVN')],
      [DA_NANG]: [
        makeToken('if-dn-base-1', 'base', 'US'),
        makeToken('if-dn-base-2', 'base', 'ARVN'),
      ],
      [NORTH_VIETNAM]: [makeToken('if-nv-nva', 'troops', 'NVA')],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected International Forces unshaded move');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected initial chooseN request for International Forces unshaded.');
    }

    const destinationPending = legalChoicesEvaluate(def, setup, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionKey]: [asTokenId('if-base')],
      },
    });
    assert.equal(destinationPending.kind, 'pending');
    if (destinationPending.kind !== 'pending') {
      throw new Error('Expected destination choice request for International Forces base placement.');
    }

    const optionValues = destinationPending.options.map((option) => String(option.value));
    assert.equal(optionValues.includes(HUE), true, 'Base should be placeable into spaces with fewer than 2 Bases');
    assert.equal(optionValues.includes(DA_NANG), false, 'Base should not be placeable into a full 2-Base space');
    assert.equal(optionValues.includes(NORTH_VIETNAM), false, 'US pieces must never be placeable into North Vietnam');
  });

  it('unshaded marks out-of-play US Bases illegal at the source-choice step when every map space is already base-full', () => {
    const def = compileDef();
    const fullMapZones = Object.fromEntries(
      def.zones
        .filter((zone) => zone.zoneKind === 'board')
        .map((zone, index) => [
          String(zone.id),
          [
            makeToken(`if-full-map-a-${index}`, 'base', 'ARVN'),
            makeToken(`if-full-map-b-${index}`, 'base', 'US'),
          ],
        ]),
    );

    const setup = setupState(def, 650015, 1, {
      'out-of-play-US:none': [
        makeToken('if-source-base', 'base', 'US'),
        makeToken('if-source-troop-1', 'troops', 'US'),
        makeToken('if-source-troop-2', 'troops', 'US'),
        makeToken('if-source-troop-3', 'troops', 'US'),
        makeToken('if-source-troop-4', 'troops', 'US'),
      ],
      ...fullMapZones,
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected International Forces unshaded move');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected initial chooseN request for International Forces unshaded.');
    }

    const legalityByTokenId = new Map(
      firstPending.options.map((option) => [String(option.value), option.legality]),
    );

    assert.equal(
      legalityByTokenId.get('if-source-base'),
      'illegal',
      'Undeliverable US Base should be illegal at the source-choice step',
    );
    assert.equal(legalityByTokenId.get('if-source-troop-1'), 'legal');
    assert.equal(legalityByTokenId.get('if-source-troop-2'), 'legal');
    assert.equal(legalityByTokenId.get('if-source-troop-3'), 'legal');
    assert.equal(legalityByTokenId.get('if-source-troop-4'), 'legal');
  });

  it('unshaded places up to 4 chosen out-of-play US pieces onto any legal map spaces, including Laos, while respecting base stacking', () => {
    const def = compileDef();
    const setup = setupState(def, 65002, 1, {
      'out-of-play-US:none': [
        makeToken('if-us-troop-1', 'troops', 'US'),
        makeToken('if-us-troop-2', 'troops', 'US'),
        makeToken('if-us-base', 'base', 'US'),
        makeToken('if-us-irregular', 'irregular', 'US', { activity: 'underground' }),
        makeToken('if-us-extra', 'troops', 'US'),
      ],
      [HUE]: [makeToken('if-hue-base', 'base', 'ARVN')],
      [DA_NANG]: [
        makeToken('if-dn-base-1', 'base', 'US'),
        makeToken('if-dn-base-2', 'base', 'ARVN'),
      ],
      [NORTH_VIETNAM]: [makeToken('if-nv-nva', 'troops', 'NVA')],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected International Forces unshaded move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$internationalForcesUsPieces',
        value: [
          asTokenId('if-us-troop-1'),
          asTokenId('if-us-troop-2'),
          asTokenId('if-us-base'),
          asTokenId('if-us-irregular'),
        ],
      },
      {
        when: (request) => request.name === `$internationalForcesDestination@${asTokenId('if-us-troop-1')}`,
        value: SAIGON,
      },
      {
        when: (request) => request.name === `$internationalForcesDestination@${asTokenId('if-us-troop-2')}`,
        value: HUE_DA_NANG_LOC,
      },
      {
        when: (request) => request.name === `$internationalForcesDestination@${asTokenId('if-us-base')}`,
        value: HUE,
      },
      {
        when: (request) => request.name === `$internationalForcesDestination@${asTokenId('if-us-irregular')}`,
        value: CENTRAL_LAOS,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => token.props.faction === 'US'), 1);
    assert.equal(
      countMatching(final, 'out-of-play-US:none', (token) => String(token.id) === 'if-us-extra'),
      1,
      'Exactly one unselected US piece should remain out of play',
    );
    assert.equal(countMatching(final, SAIGON, (token) => String(token.id) === 'if-us-troop-1'), 1);
    assert.equal(countMatching(final, HUE_DA_NANG_LOC, (token) => String(token.id) === 'if-us-troop-2'), 1);
    assert.equal(countMatching(final, HUE, (token) => String(token.id) === 'if-us-base'), 1);
    assert.equal(countMatching(final, CENTRAL_LAOS, (token) => String(token.id) === 'if-us-irregular'), 1);
    assert.equal(
      countMatching(final, HUE, (token) => token.type === 'base'),
      2,
      'Placed US Base should respect the 2-Base cap',
    );
    assert.equal(
      countMatching(final, DA_NANG, (token) => String(token.id) === 'if-us-base'),
      0,
      'Placed US Base must not enter a full 2-Base space',
    );
    assert.equal(
      countMatching(final, NORTH_VIETNAM, (token) => token.props.faction === 'US'),
      0,
      'Unshaded must not place US pieces into North Vietnam',
    );
  });

  it('unshaded places all available out-of-play US pieces when fewer than 4 exist and is a legal no-op at zero', () => {
    const def = compileDef();

    const fewPieces = setupState(def, 65003, 1, {
      'out-of-play-US:none': [
        makeToken('if-few-1', 'troops', 'US'),
        makeToken('if-few-2', 'base', 'US'),
        makeToken('if-few-3', 'irregular', 'US', { activity: 'underground' }),
      ],
      [HUE]: [makeToken('if-few-hue-base', 'base', 'ARVN')],
    });
    const fewMove = findCardMove(def, fewPieces, 'unshaded');
    assert.notEqual(fewMove, undefined, 'Expected International Forces unshaded move with fewer than 4 pieces');

    const fewFinal = applyMoveWithResolvedDecisionIds(def, fewPieces, fewMove!, {
      overrides: [
        { when: (request) => request.name === '$internationalForcesUsPieces', value: tokenIds(fewPieces, 'out-of-play-US:none') },
        { when: (request) => request.name === `$internationalForcesDestination@${asTokenId('if-few-1')}`, value: SAIGON },
        { when: (request) => request.name === `$internationalForcesDestination@${asTokenId('if-few-2')}`, value: HUE },
        { when: (request) => request.name === `$internationalForcesDestination@${asTokenId('if-few-3')}`, value: CENTRAL_LAOS },
      ],
    }).state;

    assert.equal(countMatching(fewFinal, 'out-of-play-US:none', (token) => token.props.faction === 'US'), 0);
    assert.equal(countMatching(fewFinal, SAIGON, (token) => String(token.id) === 'if-few-1'), 1);
    assert.equal(countMatching(fewFinal, HUE, (token) => String(token.id) === 'if-few-2'), 1);
    assert.equal(countMatching(fewFinal, CENTRAL_LAOS, (token) => String(token.id) === 'if-few-3'), 1);

    const noPieces = setupState(def, 65004, 1, {});
    const noMove = findCardMove(def, noPieces, 'unshaded');
    assert.notEqual(noMove, undefined, 'Expected International Forces unshaded move with zero out-of-play pieces');
    const noPending = legalChoicesEvaluate(def, noPieces, noMove!);
    assert.equal(noPending.kind, 'pending');
    if (noPending.kind !== 'pending') {
      throw new Error('Expected a zero-cardinality chooseN request for zero-piece International Forces unshaded.');
    }
    if (noPending.type !== 'chooseN') {
      throw new Error('Expected chooseN zero-cardinality request for zero-piece International Forces unshaded.');
    }
    assert.equal(noPending.min, 0);
    assert.equal(noPending.max, 0);
    assert.deepEqual(noPending.options, []);
    const noFinal = applyMoveWithResolvedDecisionIds(def, noPieces, noMove!).state;
    assert.deepEqual(noFinal.zones, noPieces.zones, 'Zero-piece unshaded should be a legal no-op');
  });

  it('shaded routes the piece-removal choice to US even when another faction executes the card', () => {
    const def = compileDef();
    const setup = setupState(def, 65005, 2, {
      [SAIGON]: [
        makeToken('if-shade-us-t1', 'troops', 'US'),
        makeToken('if-shade-us-base', 'base', 'US'),
      ],
      [HUE]: [makeToken('if-shade-us-irregular', 'irregular', 'US', { activity: 'underground' })],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected International Forces shaded move');

    const probe = resolveMoveDecisionSequence(def, setup, move!, {
      choose: () => undefined,
    });

    assert.equal(probe.complete, false);
    assert.notEqual(probe.nextDecisionSet, undefined, 'Expected shaded to expose chooser-owned stochastic alternatives');
    const chooserRequests = probe.nextDecisionSet?.filter(
      (request): request is Extract<typeof request, { type: 'chooseN' }> =>
        request.type === 'chooseN' && request.name === '$internationalForcesUsMapPieces',
    ) ?? [];
    assert.equal(chooserRequests.length, 3, 'Expected one exact chooser-owned alternative per reachable removal count');
    for (const request of chooserRequests) {
      assert.equal(request.decisionPlayer, asPlayerId(0));
      assert.equal(request.min, request.max, 'Each stochastic branch should require an exact number of US pieces');
    }
    assert.deepEqual(
      chooserRequests.map((request) => request.min).sort((left, right) => (left ?? 0) - (right ?? 0)),
      [1, 2, 3],
      'With 3 available US map pieces, the natural encoding should preserve exact branch-local counts 1..3',
    );
  });

  it('shaded exposes one exact chooser-owned stochastic alternative per reachable removal count and caps at availability', () => {
    const def = compileDef();

    const fullSetup = setupState(def, 65006, 2, {
      [SAIGON]: [
        makeToken('if-full-1', 'troops', 'US'),
        makeToken('if-full-2', 'troops', 'US'),
        makeToken('if-full-3', 'base', 'US'),
      ],
      [HUE]: [
        makeToken('if-full-4', 'irregular', 'US', { activity: 'underground' }),
        makeToken('if-full-5', 'troops', 'US'),
        makeToken('if-full-6', 'troops', 'US'),
      ],
    });

    const fullMove = findCardMove(def, fullSetup, 'shaded');
    assert.notEqual(fullMove, undefined, 'Expected International Forces shaded move with 6 US map pieces');

    const fullProbe = resolveMoveDecisionSequence(def, fullSetup, fullMove!, {
      choose: () => undefined,
    });
    assert.equal(fullProbe.stochasticDecision?.kind, 'pendingStochastic');
    assert.deepEqual(
      fullProbe.nextDecisionSet
        ?.filter((request) => request.type === 'chooseN')
        .map((request) => request.min)
        .sort((left, right) => (left ?? 0) - (right ?? 0)),
      [1, 2, 3, 4, 5, 6],
      'With 6 available US map pieces, each reachable die result should remain an exact stochastic alternative',
    );

    const limitedSetup = setupState(def, 65007, 2, {
      [SAIGON]: [makeToken('if-limited-1', 'troops', 'US')],
      [HUE]: [makeToken('if-limited-2', 'base', 'US')],
    });
    const limitedMove = findCardMove(def, limitedSetup, 'shaded');
    assert.notEqual(limitedMove, undefined, 'Expected International Forces shaded move with only 2 US map pieces');

    const limitedProbe = resolveMoveDecisionSequence(def, limitedSetup, limitedMove!, {
      choose: () => undefined,
    });
    assert.equal(limitedProbe.stochasticDecision?.kind, 'pendingStochastic');
    assert.deepEqual(
      limitedProbe.nextDecisionSet
        ?.filter((request) => request.type === 'chooseN')
        .map((request) => request.min)
        .sort((left, right) => (left ?? 0) - (right ?? 0)),
      [1, 2],
      'When the die roll can exceed availability, stochastic alternatives should cap at reachable exact counts',
    );
  });

  it('shaded executes through shared stochastic normalization and persists the sampled roll binding', () => {
    const def = compileDef();
    const setup = setupState(def, 65008, 2, {
      [SAIGON]: [
        makeToken('if-shared-1', 'troops', 'US'),
        makeToken('if-shared-2', 'troops', 'US'),
      ],
      [HUE]: [makeToken('if-shared-3', 'base', 'US')],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected International Forces shaded move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$internationalForcesUsMapPieces',
        value: (request) => {
          if (request.type !== 'chooseN') {
            return undefined;
          }
          return request.options
            .slice(0, request.min ?? 0)
            .map((option) => option.value as string | number | boolean);
        },
      },
    ];

    let stochasticRng = createRng(808n);
    const normalized = completeMoveDecisionSequence(def, setup, move!, {
      choose: (request): MoveParamValue | undefined => {
        for (const override of overrides) {
          if (!override.when(request)) {
            continue;
          }
          return typeof override.value === 'function' ? override.value(request) : override.value;
        }
        return undefined;
      },
      chooseStochastic: (request): Readonly<Record<string, MoveParamScalar>> | undefined => {
        if (request.outcomes.length === 0) {
          return undefined;
        }
        const [index, nextRngState] = nextInt(stochasticRng, 0, request.outcomes.length - 1);
        stochasticRng = nextRngState;
        return request.outcomes[index]?.bindings;
      },
    });
    assert.equal(normalized.complete, true, 'Expected shared stochastic completion to produce a fully bound move');
    if (!normalized.complete) {
      throw new Error('Expected complete stochastic normalization for International Forces shaded');
    }
    const final = applyMove(def, setup, normalized.move).state;

    assert.equal(typeof normalized.move.params.$internationalForcesRemovalRoll, 'number');
    const removedCount = countMatching(final, 'out-of-play-US:none', (token) => token.props.faction === 'US');
    assert.equal(
      removedCount,
      Math.min(Number(normalized.move.params.$internationalForcesRemovalRoll), 3),
      'Shared normalization should remove the exact capped count implied by the sampled roll',
    );
  });
});
