// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  createEvalRuntimeResources,
  initialState,
  legalChoicesEvaluate,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-78';
const ARVN_PLAYER = asPlayerId(1);
const US_PLAYER = asPlayerId(0);
const HUE = 'hue:none';
const QUANG_NAM = 'quang-nam:none';
const SAIGON = 'saigon:none';
const CENTRAL_LAOS = 'central-laos:none';
const LOC_HUE_DA_NANG = 'loc-hue-da-nang:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps: Readonly<Record<string, string | number | boolean>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extraProps,
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupEventState = (
  def: GameDef,
  seed: number,
  overrides: {
    readonly patronage?: number;
    readonly terrorSabotageMarkersPlaced?: number;
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly zoneVars?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  return {
    ...base,
    activePlayer: ARVN_PLAYER,
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      patronage: overrides.patronage ?? 10,
      terrorSabotageMarkersPlaced: overrides.terrorSabotageMarkersPlaced ?? 0,
    },
    markers: {
      ...base.markers,
      ...(overrides.markers ?? {}),
    },
    zoneVars: {
      ...base.zoneVars,
      ...(overrides.zoneVars ?? {}),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(overrides.zoneTokens ?? {}),
    },
  };
};

const findLansdaleMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.eventCardId === CARD_ID
      && move.params.side === side,
  );

describe('FITL card-78 General Lansdale', () => {
  it('compiles exact text, title, eligibility metadata, and the shaded momentum payload', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.title, 'General Lansdale');
    assert.equal(card?.sideMode, 'dual');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'NVA', 'VC', 'US']);
    assert.equal(
      card?.unshaded?.text,
      'Set a space outside Saigon with US or ARVN to Active Support. Add a Terror marker there. Patronage +1.',
    );
    assert.equal(card?.shaded?.text, 'Patronage +3. No US Assault until Coup. MOMENTUM');
    assert.deepEqual(card?.shaded?.lastingEffects?.map((effect) => effect.id), ['mom-general-landsdale']);
  });

  it('unshaded only targets eligible non-Saigon spaces with US or ARVN pieces and legal Active Support', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 78001, 4).state);
    const setup = setupEventState(def, 78001, {
      zoneTokens: {
        [HUE]: [makeToken('hue-us', 'troops', 'US')],
        [QUANG_NAM]: [makeToken('qn-arvn', 'police', 'ARVN')],
        [SAIGON]: [makeToken('saigon-us', 'troops', 'US')],
        [CENTRAL_LAOS]: [makeToken('laos-us', 'troops', 'US')],
        [LOC_HUE_DA_NANG]: [makeToken('loc-arvn', 'troops', 'ARVN')],
        'can-tho:none': [makeToken('can-tho-vc', 'guerrilla', 'VC')],
      },
      markers: {
        [HUE]: { supportOpposition: 'neutral' },
        [QUANG_NAM]: { supportOpposition: 'passiveOpposition' },
        [SAIGON]: { supportOpposition: 'neutral' },
        [CENTRAL_LAOS]: { supportOpposition: 'neutral' },
      },
      zoneVars: {
        ...base.zoneVars,
        [CENTRAL_LAOS]: { ...(base.zoneVars[CENTRAL_LAOS] ?? {}), terrorCount: 0 },
      },
    });

    const move = findLansdaleMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded General Lansdale move');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending target-space choice for General Lansdale.');
    }

    const options = pending.options.map((option) => String(option.value));
    assert.equal(options.includes(HUE), true);
    assert.equal(options.includes(QUANG_NAM), true);
    assert.equal(options.includes(SAIGON), false, 'Saigon must be excluded');
    assert.equal(options.includes(CENTRAL_LAOS), false, 'Population-0 province must not be support-eligible');
    assert.equal(options.includes(LOC_HUE_DA_NANG), false, 'LoCs must not be support-eligible');
    assert.equal(options.includes('can-tho:none'), false, 'US/ARVN presence is required');
  });

  it('unshaded sets Active Support, stacks Terror, and adds Patronage +1 exactly once', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 78002, 4).state);
    const setup = setupEventState(def, 78002, {
      patronage: 12,
      zoneTokens: {
        [HUE]: [makeToken('hue-arvn', 'police', 'ARVN')],
      },
      markers: {
        [HUE]: { supportOpposition: 'passiveOpposition' },
      },
      zoneVars: {
        ...base.zoneVars,
        [HUE]: { ...(base.zoneVars[HUE] ?? {}), terrorCount: 2 },
      },
    });

    const move = findLansdaleMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded General Lansdale move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$targetSpace', resolvedBind: '$targetSpace' }),
        value: HUE,
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(final.markers[HUE]?.supportOpposition, 'activeSupport');
    assert.equal(final.zoneVars?.[HUE]?.terrorCount, 3, 'Terror should stack even when already present');
    assert.equal(final.globalVars.terrorSabotageMarkersPlaced, 1, 'Global Terror marker pool should increment by one');
    assert.equal(final.globalVars.patronage, 13, 'Patronage should increase exactly once');
  });

  it('unshaded still sets Active Support and Patronage when the Terror/Sabotage marker pool is exhausted', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 78003, 4).state);
    const setup = setupEventState(def, 78003, {
      patronage: 74,
      terrorSabotageMarkersPlaced: 15,
      zoneTokens: {
        [QUANG_NAM]: [makeToken('quang-nam-us', 'troops', 'US')],
      },
      markers: {
        [QUANG_NAM]: { supportOpposition: 'neutral' },
      },
      zoneVars: {
        ...base.zoneVars,
        [QUANG_NAM]: { ...(base.zoneVars[QUANG_NAM] ?? {}), terrorCount: 1 },
      },
    });

    const move = findLansdaleMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded General Lansdale move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetSpace', resolvedBind: '$targetSpace' }),
          value: QUANG_NAM,
        },
      ],
    }).state;

    assert.equal(final.markers[QUANG_NAM]?.supportOpposition, 'activeSupport');
    assert.equal(final.zoneVars?.[QUANG_NAM]?.terrorCount, 1, 'No new Terror should be placed when the pool is empty');
    assert.equal(final.globalVars.terrorSabotageMarkersPlaced, 15);
    assert.equal(final.globalVars.patronage, 75, 'Patronage should still clamp at the global max');
  });

  it('shaded adds Patronage +3, blocks US Assault until Coup, and then resets at Coup', () => {
    const def = compileDef();
    const setup = setupEventState(def, 78004, {
      patronage: 72,
    });

    const move = findLansdaleMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded General Lansdale move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(afterEvent.globalVars.patronage, 75);
    assert.equal(afterEvent.globalVars.mom_generalLansdale, true, 'Momentum should activate immediately');

    const usAssaultState: GameState = {
      ...afterEvent,
      activePlayer: US_PLAYER,
      zones: {
        ...afterEvent.zones,
        [HUE]: [
          makeToken('us-assault-t', 'troops', 'US'),
          makeToken('vc-target-g', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    };

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, usAssaultState, {
          actionId: asActionId('assault'),
          params: {
            $targetSpaces: [HUE],
            $arvnFollowupSpaces: [],
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'General Lansdale momentum should prohibit US Assault before Coup',
    );

    const preparedForCoupReset: GameState = {
      ...afterEvent,
      currentPhase: asPhaseId('coupCommitment'),
      zones: {
        ...afterEvent.zones,
        'played:none': [makeToken('played-coup', 'card', 'none', { isCoup: true })],
        'lookahead:none': [makeToken('lookahead-event', 'card', 'none', { isCoup: false })],
        'deck:none': [makeToken('deck-event', 'card', 'none', { isCoup: false })],
      },
    };

    const runtime = createEvalRuntimeResources();
    const atReset = advancePhase({ def, state: preparedForCoupReset, evalRuntimeResources: runtime });
    assert.equal(atReset.currentPhase, asPhaseId('coupReset'));
    assert.equal(atReset.globalVars.mom_generalLansdale, false, 'Coup reset must clear General Lansdale momentum');
  });
});
