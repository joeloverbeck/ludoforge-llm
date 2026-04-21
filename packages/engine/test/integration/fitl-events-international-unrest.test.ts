// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  pickDeterministicChoiceValue,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
  type Token,
} from '../../src/kernel/index.js';
import { resolveDecisionContinuation } from '../../src/kernel/microturn/continuation.js';
import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-57';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, unknown>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const countTokens = (
  state: GameState,
  zoneId: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: 0 | 1 | 2 | 3,
  eligibility: Readonly<Record<'us' | 'arvn' | 'nva' | 'vc', boolean>>,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
  zones: Readonly<Record<string, readonly Token[]>>,
  globalVars?: Readonly<Record<string, number>>,
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    globalVars: {
      ...base.globalVars,
      ...(globalVars ?? {}),
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible,
          secondEligible,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        eligibility,
      },
    },
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

describe('FITL card-57 International Unrest', () => {
  it('encodes exact text and data-driven effect structure for both sides', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'ARVN', 'US']);
    assert.equal(card?.unshaded?.text, 'Any 2 US Casualties to Available.');
    assert.equal(card?.shaded?.text, '2 Available US Troops out of play. NVA add a die roll of Resources.');
    assert.equal((card?.unshaded?.effects?.[0] as { chooseN?: { bind?: string; min?: number; max?: number } })?.chooseN?.bind, '$casualtiesToAvailable');
    assert.equal((card?.unshaded?.effects?.[0] as { chooseN?: { min?: number } })?.chooseN?.min, 0);
    assert.equal((card?.unshaded?.effects?.[0] as { chooseN?: { max?: number } })?.chooseN?.max, 2);
    assert.deepEqual((card?.shaded?.effects?.[1] as { rollRandom?: { min?: number; max?: number } })?.rollRandom, tagEffectAsts({
      bind: '$dieRoll',
      min: 1,
      max: 6,
      in: [
        {
          addVar: {
            scope: 'global',
            var: 'nvaResources',
            delta: {
              _t: 2,
              ref: 'binding',
              name: '$dieRoll',
            },
          },
        },
      ],
    }));
  });

  it('unshaded lets the executing faction choose any 2 US casualty types to return to Available', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 57001, 2, {
      us: true,
      arvn: true,
      nva: true,
      vc: true,
    }, 'nva', 'vc', {
      'casualties-US:none': [
        makeToken('intl-unrest-us-troop', 'troops', 'US'),
        makeToken('intl-unrest-us-base', 'base', 'US'),
        makeToken('intl-unrest-us-irregular', 'irregular', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected International Unrest unshaded event move');

    let assertedDecisionOwner = false;
    const pendingProbe = resolveDecisionContinuation(def, setup, move!, {
      choose: (request): MoveParamValue | undefined => {
        if (request.name === '$casualtiesToAvailable') {
          assertedDecisionOwner = true;
          return undefined;
        }
        return pickDeterministicChoiceValue(request);
      },
    });
    assert.equal(pendingProbe.complete, false);
    assert.equal(pendingProbe.nextDecision?.name, '$casualtiesToAvailable');
    assert.equal(pendingProbe.nextDecision?.type, 'chooseN');
    assert.equal(assertedDecisionOwner, true);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$casualtiesToAvailable',
          value: [asTokenId('intl-unrest-us-base'), asTokenId('intl-unrest-us-irregular')],
        },
      ],
    }).state;

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.id === asTokenId('intl-unrest-us-base')),
      1,
      'Selected US base casualty should return to Available',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.id === asTokenId('intl-unrest-us-irregular')),
      1,
      'Selected US irregular casualty should return to Available',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.id === asTokenId('intl-unrest-us-troop')),
      1,
      'Unselected casualty should remain in the casualties box',
    );
  });

  it('unshaded executes partially when fewer than 2 US casualties exist and is a no-op when none exist', () => {
    const def = compileDef();

    const oneCasualty = setupCardDrivenState(def, 57002, 2, {
      us: true,
      arvn: true,
      nva: true,
      vc: true,
    }, 'nva', 'vc', {
      'casualties-US:none': [
        makeToken('intl-unrest-single-troop', 'troops', 'US'),
      ],
    });
    const oneMove = findCardMove(def, oneCasualty, 'unshaded');
    assert.notEqual(oneMove, undefined);
    const oneFinal = applyMoveWithResolvedDecisionIds(def, oneCasualty, oneMove!, {
      overrides: [
        {
          when: (request) => request.name === '$casualtiesToAvailable',
          value: [asTokenId('intl-unrest-single-troop')],
        },
      ],
    }).state;
    assert.equal(countTokens(oneFinal, 'available-US:none', (token) => token.id === asTokenId('intl-unrest-single-troop')), 1);
    assert.equal(countTokens(oneFinal, 'casualties-US:none', (token) => token.props.faction === 'US'), 0);

    const noCasualties = setupCardDrivenState(def, 57003, 2, {
      us: true,
      arvn: true,
      nva: true,
      vc: true,
    }, 'nva', 'vc', {});
    const noMove = findCardMove(def, noCasualties, 'unshaded');
    assert.notEqual(noMove, undefined);
    const noFinal = applyMoveWithResolvedDecisionIds(def, noCasualties, noMove!).state;
    assert.deepEqual(noFinal.zones, noCasualties.zones, 'Unshaded should be a legal no-op with zero US casualties');
  });

  it('shaded moves up to 2 available US troops out of play, ignores other US piece types, and adds deterministic d6 NVA resources', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 57004, 2, {
      us: true,
      arvn: true,
      nva: true,
      vc: true,
    }, 'nva', 'vc', {
      'available-US:none': [
        makeToken('intl-unrest-av-t1', 'troops', 'US'),
        makeToken('intl-unrest-av-t2', 'troops', 'US'),
        makeToken('intl-unrest-av-t3', 'troops', 'US'),
        makeToken('intl-unrest-av-base', 'base', 'US'),
        makeToken('intl-unrest-av-irregular', 'irregular', 'US'),
      ],
    }, { nvaResources: 9 });
    const duplicate = setupCardDrivenState(def, 57004, 2, {
      us: true,
      arvn: true,
      nva: true,
      vc: true,
    }, 'nva', 'vc', {
      'available-US:none': [
        makeToken('intl-unrest-av-t1', 'troops', 'US'),
        makeToken('intl-unrest-av-t2', 'troops', 'US'),
        makeToken('intl-unrest-av-t3', 'troops', 'US'),
        makeToken('intl-unrest-av-base', 'base', 'US'),
        makeToken('intl-unrest-av-irregular', 'irregular', 'US'),
      ],
    }, { nvaResources: 9 });

    const move = findCardMove(def, setup, 'shaded');
    const duplicateMove = findCardMove(def, duplicate, 'shaded');
    assert.notEqual(move, undefined, 'Expected International Unrest shaded event move');
    assert.notEqual(duplicateMove, undefined, 'Expected duplicate shaded move');

    const after = applyMove(def, setup, move!).state;
    const duplicateAfter = applyMove(def, duplicate, duplicateMove!).state;
    const resourceDelta = Number(after.globalVars.nvaResources) - 9;

    assert.equal(
      countTokens(after, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'Shaded should move exactly 2 available US troops out of play',
    );
    assert.equal(
      countTokens(after, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'Exactly one unselected US troop should remain available',
    );
    assert.equal(
      countTokens(after, 'available-US:none', (token) => token.id === asTokenId('intl-unrest-av-base')),
      1,
      'US bases should remain in Available',
    );
    assert.equal(
      countTokens(after, 'available-US:none', (token) => token.id === asTokenId('intl-unrest-av-irregular')),
      1,
      'US irregulars should remain in Available',
    );
    assert.ok(resourceDelta >= 1 && resourceDelta <= 6, 'Shaded should add exactly one d6 to NVA Resources');
    assert.deepEqual(after.globalVars, duplicateAfter.globalVars, 'Shaded die roll should be deterministic for the same seeded state');
  });

  it('shaded executes partially with fewer than 2 available US troops and respects the NVA resource cap', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 57005, 2, {
      us: true,
      arvn: true,
      nva: true,
      vc: true,
    }, 'nva', 'vc', {
      'available-US:none': [
        makeToken('intl-unrest-one-troop', 'troops', 'US'),
        makeToken('intl-unrest-one-base', 'base', 'US'),
      ],
    }, { nvaResources: 74 });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected International Unrest shaded event move');

    const final = applyMove(def, setup, move!).state;

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.id === asTokenId('intl-unrest-one-troop')),
      1,
      'Single available troop should still move out of play',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.id === asTokenId('intl-unrest-one-base')),
      1,
      'Non-troop available pieces should remain untouched',
    );
    assert.equal(final.globalVars.nvaResources, 75, 'NVA resources must stay capped at 75');
  });
});
