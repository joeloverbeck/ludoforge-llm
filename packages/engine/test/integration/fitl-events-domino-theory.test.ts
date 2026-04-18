// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-82';

const usPiecesBranch = 'us-out-of-play-to-available';
const arvnPiecesBranch = 'arvn-out-of-play-to-available';
const resourcesBranch = 'resources-and-aid';

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
    readonly arvnResources?: number;
    readonly zones?: Readonly<Record<string, readonly Token[]>>;
  } = {},
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(1),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      ...(options.aid === undefined ? {} : { aid: options.aid }),
      ...(options.arvnResources === undefined ? {} : { arvnResources: options.arvnResources }),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(options.zones ?? {}),
    },
  };
};

const findCard82Move = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch?: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (branch === undefined || move.params.branch === branch)
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countMatching = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-82 Domino Theory', () => {
  it('encodes exact text, metadata, and all three unshaded choices through generic event data', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-82 in production deck');
    assert.equal(card?.title, 'Domino Theory');
    assert.equal(card?.sideMode, 'dual');
    assert.deepEqual(card?.tags, []);
    assert.equal(card?.metadata?.period, '1965');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'VC', 'US', 'NVA']);
    assert.equal(card?.metadata?.flavorText, 'U.S. prestige is on the line.');
    assert.equal(
      card?.unshaded?.text,
      'Up to 3 US or 6 ARVN out-of-play pieces to Available. Or ARVN Resources and Aid each +9.',
    );
    assert.equal(card?.shaded?.text, '3 Available US Troops out of play. Aid -9.');
    assert.deepEqual(
      card?.unshaded?.branches?.map((branch) => String(branch.id)),
      [usPiecesBranch, arvnPiecesBranch, resourcesBranch],
    );

    const unshadedText = JSON.stringify(card?.unshaded?.branches ?? []);
    assert.match(unshadedText, /"zone":"out-of-play-US:none"/);
    assert.match(unshadedText, /"zoneExpr":"available-US:none"/);
    assert.match(unshadedText, /"left":3/);
    assert.match(unshadedText, /"zone":"out-of-play-ARVN:none"/);
    assert.match(unshadedText, /"zoneExpr":"available-ARVN:none"/);
    assert.match(unshadedText, /"left":6/);
    assert.match(unshadedText, /"var":"arvnResources".*"delta":9/);
    assert.match(unshadedText, /"var":"aid".*"delta":9/);

    const shadedText = JSON.stringify(card?.shaded?.effects ?? []);
    assert.match(shadedText, /"bind":"\$dominoTheoryAvailableUsTroops"/);
    assert.match(shadedText, /"zone":"available-US:none"/);
    assert.match(shadedText, /"prop":"type".*"value":"troops"/);
    assert.match(shadedText, /"zoneExpr":"out-of-play-US:none"/);
    assert.match(shadedText, /"var":"aid".*"delta":-9/);
  });

  it('unshaded US-piece branch lets the executing faction choose up to 3 US out-of-play pieces, including bases', () => {
    const def = compileDef();
    const setup = setupState(def, 82001, {
      zones: {
        'out-of-play-US:none': [
          makeToken('domino-us-troop', 'troops', 'US'),
          makeToken('domino-us-base', 'base', 'US'),
          makeToken('domino-us-irregular', 'irregular', 'US', { activity: 'underground' }),
          makeToken('domino-us-extra', 'troops', 'US'),
        ],
      },
    });

    const move = findCard82Move(def, setup, 'unshaded', usPiecesBranch);
    assert.notEqual(move, undefined, 'Expected card-82 US-piece branch');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending US out-of-play selector for Domino Theory.');
    }
    if (pending.type !== 'chooseN') {
      throw new Error('Expected chooseN US out-of-play selector for Domino Theory.');
    }

    assert.equal(pending.min, 0);
    assert.equal(pending.max, 3);
    assert.deepEqual(
      pending.options.map((option) => String(option.value)).sort(),
      [
        asTokenId('domino-us-base'),
        asTokenId('domino-us-extra'),
        asTokenId('domino-us-irregular'),
        asTokenId('domino-us-troop'),
      ].sort(),
    );

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$dominoTheoryUsPieces',
          value: [asTokenId('domino-us-base'), asTokenId('domino-us-irregular'), asTokenId('domino-us-troop')],
        },
      ],
    }).state;

    assert.equal(countMatching(final, 'available-US:none', (token) => String(token.id) === 'domino-us-base'), 1);
    assert.equal(countMatching(final, 'available-US:none', (token) => String(token.id) === 'domino-us-irregular'), 1);
    assert.equal(countMatching(final, 'available-US:none', (token) => String(token.id) === 'domino-us-troop'), 1);
    assert.equal(
      countMatching(final, 'out-of-play-US:none', (token) => String(token.id) === 'domino-us-extra'),
      1,
      'Unselected US out-of-play pieces should remain in out of play',
    );
  });

  it('unshaded ARVN-piece branch scales down below 6 and can return ARVN bases as pieces', () => {
    const def = compileDef();
    const setup = setupState(def, 82002, {
      zones: {
        'out-of-play-ARVN:none': [
          makeToken('domino-arvn-t1', 'troops', 'ARVN'),
          makeToken('domino-arvn-t2', 'troops', 'ARVN'),
          makeToken('domino-arvn-base', 'base', 'ARVN'),
          makeToken('domino-arvn-police', 'police', 'ARVN'),
        ],
      },
    });

    const move = findCard82Move(def, setup, 'unshaded', arvnPiecesBranch);
    assert.notEqual(move, undefined, 'Expected card-82 ARVN-piece branch');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending ARVN out-of-play selector for Domino Theory.');
    }
    if (pending.type !== 'chooseN') {
      throw new Error('Expected chooseN ARVN out-of-play selector for Domino Theory.');
    }

    assert.equal(pending.min, 0);
    assert.equal(pending.max, 4);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$dominoTheoryArvnPieces',
          value: [
            asTokenId('domino-arvn-base'),
            asTokenId('domino-arvn-police'),
            asTokenId('domino-arvn-t1'),
            asTokenId('domino-arvn-t2'),
          ],
        },
      ],
    }).state;

    assert.equal(countMatching(final, 'available-ARVN:none', (token) => String(token.id) === 'domino-arvn-base'), 1);
    assert.equal(countMatching(final, 'available-ARVN:none', (token) => String(token.id) === 'domino-arvn-police'), 1);
    assert.equal(countMatching(final, 'available-ARVN:none', (token) => String(token.id) === 'domino-arvn-t1'), 1);
    assert.equal(countMatching(final, 'available-ARVN:none', (token) => String(token.id) === 'domino-arvn-t2'), 1);
    assert.equal(countMatching(final, 'out-of-play-ARVN:none', (token) => token.props.faction === 'ARVN'), 0);
  });

  it('unshaded resources branch raises Aid and ARVN Resources by 9 each, capped at 75, without moving pieces', () => {
    const def = compileDef();
    const setup = setupState(def, 82003, {
      aid: 70,
      arvnResources: 68,
      zones: {
        'out-of-play-US:none': [makeToken('domino-unused-us', 'base', 'US')],
        'out-of-play-ARVN:none': [makeToken('domino-unused-arvn', 'troops', 'ARVN')],
      },
    });

    const move = findCard82Move(def, setup, 'unshaded', resourcesBranch);
    assert.notEqual(move, undefined, 'Expected card-82 resources branch');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(final.globalVars.aid, 75);
    assert.equal(final.globalVars.arvnResources, 75);
    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => String(token.id) === 'domino-unused-us'), 1);
    assert.equal(countMatching(final, 'out-of-play-ARVN:none', (token) => String(token.id) === 'domino-unused-arvn'), 1);
  });

  it('shaded moves up to 3 available US troops out of play, ignores non-troops, and reduces Aid by 9', () => {
    const def = compileDef();
    const setup = setupState(def, 82004, {
      aid: 12,
      zones: {
        'available-US:none': [
          makeToken('domino-av-t1', 'troops', 'US'),
          makeToken('domino-av-t2', 'troops', 'US'),
          makeToken('domino-av-t3', 'troops', 'US'),
          makeToken('domino-av-t4', 'troops', 'US'),
          makeToken('domino-av-base', 'base', 'US'),
          makeToken('domino-av-irregular', 'irregular', 'US'),
        ],
      },
    });

    const move = findCard82Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-82 shaded move');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending available US troop selector for Domino Theory shaded.');
    }
    if (pending.type !== 'chooseN') {
      throw new Error('Expected chooseN available US troop selector for Domino Theory shaded.');
    }

    assert.equal(pending.min, 0);
    assert.equal(pending.max, 3);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$dominoTheoryAvailableUsTroops',
          value: [asTokenId('domino-av-t1'), asTokenId('domino-av-t2'), asTokenId('domino-av-t3')],
        },
      ],
    }).state;

    assert.equal(final.globalVars.aid, 3);
    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => String(token.id) === 'domino-av-t1'), 1);
    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => String(token.id) === 'domino-av-t2'), 1);
    assert.equal(countMatching(final, 'out-of-play-US:none', (token) => String(token.id) === 'domino-av-t3'), 1);
    assert.equal(
      countMatching(final, 'available-US:none', (token) => String(token.id) === 'domino-av-t4'),
      1,
      'One unselected US troop should remain available',
    );
    assert.equal(
      countMatching(final, 'available-US:none', (token) => String(token.id) === 'domino-av-base'),
      1,
      'US bases should not be moved by shaded Domino Theory',
    );
    assert.equal(
      countMatching(final, 'available-US:none', (token) => String(token.id) === 'domino-av-irregular'),
      1,
      'US irregulars should not be moved by shaded Domino Theory',
    );
  });

  it('shaded implements what it can with fewer than 3 US troops and floors Aid at 0 even if no troop can move', () => {
    const def = compileDef();

    const oneTroop = setupState(def, 82005, {
      aid: 4,
      zones: {
        'available-US:none': [
          makeToken('domino-one-troop', 'troops', 'US'),
          makeToken('domino-one-base', 'base', 'US'),
        ],
      },
    });
    const oneMove = findCard82Move(def, oneTroop, 'shaded');
    assert.notEqual(oneMove, undefined, 'Expected card-82 shaded move with one troop');

    const oneFinal = applyMoveWithResolvedDecisionIds(def, oneTroop, oneMove!, {
      overrides: [
        {
          when: (request) => request.name === '$dominoTheoryAvailableUsTroops',
          value: [asTokenId('domino-one-troop')],
        },
      ],
    }).state;
    assert.equal(countMatching(oneFinal, 'out-of-play-US:none', (token) => String(token.id) === 'domino-one-troop'), 1);
    assert.equal(oneFinal.globalVars.aid, 0, 'Aid should floor at 0 after shaded Domino Theory');
    assert.equal(countMatching(oneFinal, 'available-US:none', (token) => String(token.id) === 'domino-one-base'), 1);

    const noTroops = setupState(def, 82006, {
      aid: 7,
      zones: {
        'available-US:none': [makeToken('domino-no-troop-base', 'base', 'US')],
      },
    });
    const noMove = findCard82Move(def, noTroops, 'shaded');
    assert.notEqual(noMove, undefined, 'Expected card-82 shaded move with zero US troops');

    const noPending = legalChoicesEvaluate(def, noTroops, noMove!);
    assert.equal(noPending.kind, 'pending');
    if (noPending.kind !== 'pending') {
      throw new Error('Expected zero-cardinality shaded selector for Domino Theory.');
    }
    if (noPending.type !== 'chooseN') {
      throw new Error('Expected chooseN zero-cardinality shaded selector for Domino Theory.');
    }

    assert.equal(noPending.min, 0);
    assert.equal(noPending.max, 0);
    assert.deepEqual(noPending.options, []);

    const noFinal = applyMoveWithResolvedDecisionIds(def, noTroops, noMove!).state;
    assert.equal(noFinal.globalVars.aid, 0);
    assert.equal(countMatching(noFinal, 'available-US:none', (token) => String(token.id) === 'domino-no-troop-base'), 1);
    assert.equal(countMatching(noFinal, 'out-of-play-US:none', (token) => token.props.faction === 'US'), 0);
  });
});
