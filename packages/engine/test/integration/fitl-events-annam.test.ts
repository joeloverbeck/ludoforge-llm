import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalChoicesDiscover,
  legalMoves,
  ILLEGAL_MOVE_REASONS,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-76';

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

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

const findAnnamMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

describe('FITL card-76 Annam', () => {
  it('unshaded deducts each insurgent faction once per space containing both NVA and VC pieces, then raises Patronage by 2', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 76001, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        nvaResources: 5,
        vcResources: 4,
        patronage: 74,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        'hue:none': [
          makeToken('annam-hue-nva-t', 'troops', 'NVA'),
          makeToken('annam-hue-vc-g', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('annam-hue-vc-b', 'base', 'VC'),
        ],
        'loc-hue-da-nang:none': [
          makeToken('annam-loc-nva-g', 'guerrilla', 'NVA', { activity: 'active' }),
          makeToken('annam-loc-vc-g', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'southern-laos:none': [
          makeToken('annam-laos-nva-b', 'base', 'NVA'),
          makeToken('annam-laos-vc-g', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'da-nang:none': [makeToken('annam-da-nang-only-nva', 'troops', 'NVA')],
        'saigon:none': [makeToken('annam-saigon-only-vc', 'guerrilla', 'VC', { activity: 'underground' })],
      },
    };

    const move = findAnnamMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-76 unshaded event move');

    const after = applyMove(def, setup, move!).state;
    assert.equal(after.globalVars.nvaResources, 2, 'NVA should lose 1 Resource per shared space');
    assert.equal(after.globalVars.vcResources, 1, 'VC should lose 1 Resource per shared space');
    assert.equal(after.globalVars.patronage, 75, 'Patronage +2 should clamp at 75');
  });

  it('unshaded clamps resource losses at zero when shared-space count exceeds current Resources', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 76002, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        nvaResources: 1,
        vcResources: 2,
        patronage: 20,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        'hue:none': [
          makeToken('annam-clamp-hue-nva', 'troops', 'NVA'),
          makeToken('annam-clamp-hue-vc', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'quang-nam:none': [
          makeToken('annam-clamp-qn-nva', 'base', 'NVA'),
          makeToken('annam-clamp-qn-vc', 'base', 'VC'),
        ],
        'north-vietnam:none': [
          makeToken('annam-clamp-nv-nva', 'troops', 'NVA'),
          makeToken('annam-clamp-nv-vc', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    };

    const move = findAnnamMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-76 unshaded event move');

    const after = applyMove(def, setup, move!).state;
    assert.equal(after.globalVars.nvaResources, 0);
    assert.equal(after.globalVars.vcResources, 0);
    assert.equal(after.globalVars.patronage, 22);
  });

  it('shaded removes Support from Hue, Da Nang, and exactly one supported adjacent province', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 76003, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      markers: {
        ...base.markers,
        'hue:none': { supportOpposition: 'activeSupport' },
        'da-nang:none': { supportOpposition: 'passiveSupport' },
        'quang-tri-thua-thien:none': { supportOpposition: 'activeSupport' },
        'quang-nam:none': { supportOpposition: 'passiveSupport' },
        'quang-tin-quang-ngai:none': { supportOpposition: 'activeSupport' },
        'saigon:none': { supportOpposition: 'activeSupport' },
        'loc-hue-da-nang:none': { supportOpposition: 'activeSupport' },
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
      },
    };

    const move = findAnnamMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-76 shaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$annamAdjacentProvince',
        value: ['quang-nam:none'],
      },
    ];

    const after = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;
    assert.equal(after.markers['hue:none']?.supportOpposition, 'neutral');
    assert.equal(after.markers['da-nang:none']?.supportOpposition, 'neutral');
    assert.equal(after.markers['quang-nam:none']?.supportOpposition, 'neutral');
    assert.equal(after.markers['quang-tri-thua-thien:none']?.supportOpposition, 'activeSupport');
    assert.equal(after.markers['quang-tin-quang-ngai:none']?.supportOpposition, 'activeSupport');
    assert.equal(after.markers['saigon:none']?.supportOpposition, 'activeSupport');
    assert.equal(after.markers['loc-hue-da-nang:none']?.supportOpposition, 'activeSupport');
  });

  it('shaded restricts the province choice to supported provinces adjacent to Hue or Da Nang', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 76004, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      markers: {
        ...base.markers,
        'hue:none': { supportOpposition: 'passiveSupport' },
        'da-nang:none': { supportOpposition: 'activeSupport' },
        'quang-tri-thua-thien:none': { supportOpposition: 'activeSupport' },
        'quang-nam:none': { supportOpposition: 'passiveSupport' },
        'quang-tin-quang-ngai:none': { supportOpposition: 'neutral' },
        'binh-dinh:none': { supportOpposition: 'activeSupport' },
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
      },
    };

    const move = findAnnamMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-76 shaded event move');

    const pending = legalChoicesDiscover(def, setup, move!);
    assert.equal(pending.kind, 'pending', 'Expected adjacent-province choice to be pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending decision for card-76 shaded');
    }

    const options = pending.options.map((option) => String(option.value)).sort();
    assert.deepEqual(options, ['quang-nam:none', 'quang-tri-thua-thien:none']);

    assert.throws(
      () =>
        applyMove(def, setup, {
          ...move!,
          params: {
            ...move!.params,
            [pending.decisionId]: ['loc-hue-da-nang:none'],
          },
        }),
      (error: unknown) => {
        const details = error as { readonly reason?: string; readonly context?: { readonly detail?: string } };
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID);
        assert.match(String(details.context?.detail ?? ''), /outside options domain/);
        return true;
      },
    );

    assert.throws(
      () =>
        applyMove(def, setup, {
          ...move!,
          params: {
            ...move!.params,
            [pending.decisionId]: [],
          },
        }),
      (error: unknown) => {
        const details = error as { readonly reason?: string; readonly context?: { readonly detail?: string } };
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID);
        assert.match(String(details.context?.detail ?? ''), /chooseN selection cardinality mismatch/);
        return true;
      },
    );
  });

  it('shaded skips the province choice when no adjacent province currently has Support', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 76005, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      markers: {
        ...base.markers,
        'hue:none': { supportOpposition: 'activeSupport' },
        'da-nang:none': { supportOpposition: 'passiveSupport' },
        'quang-tri-thua-thien:none': { supportOpposition: 'neutral' },
        'quang-nam:none': { supportOpposition: 'passiveOpposition' },
        'quang-tin-quang-ngai:none': { supportOpposition: 'activeOpposition' },
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
      },
    };

    const move = findAnnamMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-76 shaded event move');

    const after = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.equal(after.markers['hue:none']?.supportOpposition, 'neutral');
    assert.equal(after.markers['da-nang:none']?.supportOpposition, 'neutral');
    assert.equal(after.markers['quang-tri-thua-thien:none']?.supportOpposition, 'neutral');
    assert.equal(after.markers['quang-nam:none']?.supportOpposition, 'passiveOpposition');
    assert.equal(after.markers['quang-tin-quang-ngai:none']?.supportOpposition, 'activeOpposition');
  });
});
