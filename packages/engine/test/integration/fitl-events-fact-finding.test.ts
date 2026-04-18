// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalChoicesEvaluate,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-63';
const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const DA_NANG = 'da-nang:none';
const CAN_THO = 'can-tho:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const HUE_DA_NANG_LOC = 'loc-hue-da-nang:none';
const CENTRAL_LAOS = 'central-laos:none';

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
  options: {
    readonly aid?: number;
    readonly patronage?: number;
    readonly arvnResources?: number;
    readonly vcResources?: number;
    readonly zones?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: GameState['markers'];
  } = {},
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      ...(options.aid === undefined ? {} : { aid: options.aid }),
      ...(options.patronage === undefined ? {} : { patronage: options.patronage }),
      ...(options.arvnResources === undefined ? {} : { arvnResources: options.arvnResources }),
      ...(options.vcResources === undefined ? {} : { vcResources: options.vcResources }),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(options.zones ?? {}),
    },
    markers: {
      ...base.markers,
      ...(options.markers ?? {}),
    },
  };
};

const findCard63Move = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && move.params.branch === branch
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countMatching = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const supportState = (state: GameState, zone: string): string => String(state.markers[zone]?.supportOpposition ?? 'neutral');

const unshadedMoveBranch = 'us-oop-aid';
const unshadedTransferBranch = 'pat-aid';
const shadedPatronageBranch = 'rm-sup-patronage';
const shadedVcBranch = 'rm-sup-vc';

describe('FITL card-63 Fact Finding', () => {
  it('encodes exact metadata, branch text, and corrected COIN-controlled city targeting', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-63 in production deck');
    assert.equal(card?.title, 'Fact Finding');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'US', 'NVA', 'VC']);
    assert.equal(card?.metadata?.flavorText, 'Investigations expose gaps in pacification claims.');
    assert.equal(
      card?.unshaded?.text,
      '2 US pieces from out-of-play to South Vietnam, or transfer a die roll from Patronage to ARVN Resources. Aid +6.',
    );
    assert.equal(
      card?.shaded?.text,
      'Remove Support from a COIN-Controlled City outside Saigon. Patronage +4 or VC Resources +4.',
    );
    assert.deepEqual(
      card?.unshaded?.branches?.map((branch) => String(branch.id)),
      [unshadedMoveBranch, unshadedTransferBranch],
    );
    assert.deepEqual(
      card?.shaded?.branches?.map((branch) => String(branch.id)),
      [shadedPatronageBranch, shadedVcBranch],
    );

    const compiledText = JSON.stringify(card?.unshaded?.branches ?? []);
    assert.match(compiledText, /"country".*"southVietnam"/);
    assert.match(compiledText, /"prop":"type".*"value":"base"/);
    assert.match(compiledText, /"prop":"category".*"right":"loc"/);
    assert.match(compiledText, /"var":"aid".*"delta":6/);

    const shadedText = JSON.stringify(card?.shaded?.branches ?? []);
    assert.match(shadedText, /"var":"patronage".*"delta":4/);
    assert.match(shadedText, /"var":"vcResources".*"delta":4/);
  });

  it('unshaded troop branch moves up to 2 selected US out-of-play pieces into South Vietnam and grants Aid +6', () => {
    const def = compileDef();
    const setup = setupState(def, 63001, {
      aid: 70,
      zones: {
        'out-of-play-US:none': [
          makeToken('fact-us-troop', 'troops', 'US'),
          makeToken('fact-us-irregular', 'irregular', 'US', { activity: 'underground' }),
          makeToken('fact-us-base', 'base', 'US'),
        ],
        [DA_NANG]: [
          makeToken('fact-dn-base-1', 'base', 'ARVN'),
          makeToken('fact-dn-base-2', 'base', 'US'),
        ],
        [CENTRAL_LAOS]: [makeToken('fact-laos-marker', 'troops', 'NVA')],
      },
    });

    const move = findCard63Move(def, setup, 'unshaded', unshadedMoveBranch);
    assert.notEqual(move, undefined, 'Expected card-63 unshaded troop branch');

    const overrides: readonly DecisionOverrideRule[] = [
      {
                when: (request) => request.name === '$ffUs',
                value: [asTokenId('fact-us-troop'), asTokenId('fact-us-base')],
            },
            {
                when: (request) => request.name === `$ffDest@${asTokenId('fact-us-troop')}`,
                value: HUE_DA_NANG_LOC,
            },
            {
                when: (request) => request.name === `$ffDest@${asTokenId('fact-us-base')}`,
                value: HUE,
            },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(final.globalVars.aid, 75, 'Aid should increase by 6 and clamp at 75');
    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => token.props.faction === 'US'), 1);
    assert.equal(countMatching(final, HUE_DA_NANG_LOC, (token) => String(token.id) === 'fact-us-troop'), 1);
    assert.equal(countMatching(final, HUE, (token) => String(token.id) === 'fact-us-base'), 1);
    assert.equal(countMatching(final, DA_NANG, (token) => String(token.id) === 'fact-us-base'), 0);
    assert.equal(countMatching(final, CENTRAL_LAOS, (token) => token.props.faction === 'US'), 0);
    assert.equal(
      countMatching(final, 'out-of-play-US:none', (token) => String(token.id) === 'fact-us-irregular'),
      1,
      'Unselected US piece should remain out of play',
    );
  });

  it('unshaded troop branch still resolves with fewer than 2 out-of-play US pieces', () => {
    const def = compileDef();
    const setup = setupState(def, 63002, {
      aid: 8,
      zones: {
        'out-of-play-US:none': [makeToken('fact-only-piece', 'troops', 'US')],
      },
    });

    const move = findCard63Move(def, setup, 'unshaded', unshadedMoveBranch);
    assert.notEqual(move, undefined, 'Expected card-63 unshaded troop branch');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
                { when: (request) => request.name === '$ffUs', value: [asTokenId('fact-only-piece')] },
                { when: (request) => request.name === `$ffDest@${asTokenId('fact-only-piece')}`, value: SAIGON },
      ],
    }).state;

    assert.equal(final.globalVars.aid, 14);
    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => token.props.faction === 'US'), 0);
    assert.equal(countMatching(final, SAIGON, (token) => String(token.id) === 'fact-only-piece'), 1);
  });

  it('unshaded transfer branch conserves transfer amount, grants Aid +6, and caps by available Patronage', () => {
    const def = compileDef();

    let chosenSeed: number | null = null;
    for (let seed = 1; seed <= 128; seed += 1) {
      const move = findCard63Move(
        def,
        setupState(def, seed, {
          aid: 11,
          patronage: 10,
          arvnResources: 20,
        }),
        'unshaded',
        unshadedTransferBranch,
      );
      assert.notEqual(move, undefined, `Expected transfer branch for seed ${seed}`);
      const final = applyMove(def, setupState(def, seed, {
        aid: 11,
        patronage: 10,
        arvnResources: 20,
      }), move!).state;
      const largeTransfer = Number(final.globalVars.arvnResources) - 20;
      if (largeTransfer > 2) {
        chosenSeed = seed;
        break;
      }
    }

    assert.notEqual(chosenSeed, null, 'Expected at least one deterministic seed with die roll above 2');

    const highPatronageStart = setupState(def, chosenSeed!, {
      aid: 11,
      patronage: 10,
      arvnResources: 20,
    });
    const move = findCard63Move(def, highPatronageStart, 'unshaded', unshadedTransferBranch);
    assert.notEqual(move, undefined, 'Expected transfer branch move');
    const highPatronageFinal = applyMove(def, highPatronageStart, move!).state;

    const transferred = Number(highPatronageFinal.globalVars.arvnResources) - 20;
    assert.equal(highPatronageFinal.globalVars.aid, 17, 'Aid should always increase by 6');
    assert.equal(Number(highPatronageFinal.globalVars.patronage), 10 - transferred);
    assert.equal(transferred >= 3 && transferred <= 6, true, 'High-patronage transfer should reflect the die roll');

    const cappedStart = setupState(def, chosenSeed!, {
      aid: 11,
      patronage: 2,
      arvnResources: 20,
    });
    const cappedFinal = applyMove(def, cappedStart, move!).state;
    assert.equal(cappedFinal.globalVars.aid, 17, 'Aid should still increase by 6 when Patronage is scarce');
    assert.equal(cappedFinal.globalVars.patronage, 0, 'Transfer must not drive Patronage below 0');
    assert.equal(cappedFinal.globalVars.arvnResources, 22, 'Transfer must cap at remaining Patronage');

    const zeroPatronageStart = setupState(def, chosenSeed!, {
      aid: 11,
      patronage: 0,
      arvnResources: 20,
    });
    const zeroPatronageFinal = applyMove(def, zeroPatronageStart, move!).state;
    assert.equal(zeroPatronageFinal.globalVars.aid, 17);
    assert.equal(zeroPatronageFinal.globalVars.patronage, 0);
    assert.equal(zeroPatronageFinal.globalVars.arvnResources, 20);
  });

  it('shaded branches only target COIN-controlled supported cities outside Saigon under the corrected Rule 1.7 predicate', () => {
    const def = compileDef();
    const setup = setupState(def, 63003, {
      zones: {
        [HUE]: [
          makeToken('hue-us', 'troops', 'US'),
          makeToken('hue-arvn', 'troops', 'ARVN'),
        ],
        [DA_NANG]: [
          makeToken('danang-us', 'troops', 'US'),
          makeToken('danang-vc', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [CAN_THO]: [
          makeToken('cantho-us', 'troops', 'US'),
          makeToken('cantho-arvn', 'police', 'ARVN'),
          makeToken('cantho-vc', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        [SAIGON]: [
          makeToken('saigon-us', 'troops', 'US'),
          makeToken('saigon-arvn', 'police', 'ARVN'),
        ],
        [QUANG_TRI]: [
          makeToken('qt-us', 'troops', 'US'),
          makeToken('qt-arvn', 'troops', 'ARVN'),
        ],
      },
      markers: {
        [HUE]: { supportOpposition: 'activeSupport' },
        [DA_NANG]: { supportOpposition: 'passiveSupport' },
        [CAN_THO]: { supportOpposition: 'passiveSupport' },
        [SAIGON]: { supportOpposition: 'activeSupport' },
        [QUANG_TRI]: { supportOpposition: 'neutral' },
      },
    });

    const move = findCard63Move(def, setup, 'shaded', shadedPatronageBranch);
    assert.notEqual(move, undefined, 'Expected card-63 shaded patronage branch');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending city selector for Fact Finding shaded');
    }
    const options = pending.options.map((option) => String(option.value)).sort();
    assert.deepEqual(
      options,
      [CAN_THO, HUE].sort(),
      'Only supported non-Saigon cities with true COIN control should be targetable',
    );
  });

  it('shaded patronage branch removes active support to Neutral and clamps Patronage +4', () => {
    const def = compileDef();
    const setup = setupState(def, 63004, {
      patronage: 73,
      zones: {
        [HUE]: [
          makeToken('hue-us', 'troops', 'US'),
          makeToken('hue-arvn', 'troops', 'ARVN'),
        ],
      },
      markers: {
        [HUE]: { supportOpposition: 'activeSupport' },
      },
    });

    const move = findCard63Move(def, setup, 'shaded', shadedPatronageBranch);
    assert.notEqual(move, undefined, 'Expected shaded patronage branch');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [{ when: (request) => request.name === '$targetCity', value: HUE }],
    }).state;

    assert.equal(supportState(final, HUE), 'neutral');
    assert.equal(final.globalVars.patronage, 75);
  });

  it('shaded VC branch removes passive support to Neutral and clamps VC Resources +4', () => {
    const def = compileDef();
    const setup = setupState(def, 63005, {
      vcResources: 74,
      zones: {
        [CAN_THO]: [
          makeToken('cantho-us', 'troops', 'US'),
          makeToken('cantho-arvn', 'police', 'ARVN'),
        ],
      },
      markers: {
        [CAN_THO]: { supportOpposition: 'passiveSupport' },
      },
    });

    const move = findCard63Move(def, setup, 'shaded', shadedVcBranch);
    assert.notEqual(move, undefined, 'Expected shaded VC-resources branch');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [{ when: (request) => request.name === '$targetCity', value: CAN_THO }],
    }).state;

    assert.equal(supportState(final, CAN_THO), 'neutral');
    assert.equal(final.globalVars.vcResources, 75);
  });

  it('suppresses shaded branches when no eligible supported COIN-controlled city outside Saigon exists', () => {
    const def = compileDef();
    const setup = setupState(def, 63006, {
      zones: {
        [SAIGON]: [
          makeToken('saigon-us', 'troops', 'US'),
          makeToken('saigon-arvn', 'troops', 'ARVN'),
        ],
        [HUE]: [makeToken('hue-us', 'troops', 'US')],
      },
      markers: {
        [SAIGON]: { supportOpposition: 'activeSupport' },
        [HUE]: { supportOpposition: 'neutral' },
      },
    });

    assert.equal(findCard63Move(def, setup, 'shaded', shadedPatronageBranch), undefined);
    assert.equal(findCard63Move(def, setup, 'shaded', shadedVcBranch), undefined);
  });
});
