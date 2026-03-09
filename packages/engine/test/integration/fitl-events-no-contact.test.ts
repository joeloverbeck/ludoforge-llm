import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-110';

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
  extras: Readonly<Record<string, unknown>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extras,
  },
});

const setupNoContactState = (
  def: GameDef,
  overrides: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

  const base = clearAllZones(initialState(def, 110001, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...overrides.zoneTokens,
    },
  };
};

const findNoContactMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const tokenIdsInZone = (state: GameState, zoneId: string): Set<string> =>
  new Set((state.zones[zoneId] ?? []).map((token) => String(token.id)));

const tokensInZone = (state: GameState, zoneId: string): readonly Token[] =>
  (state.zones[zoneId] ?? []) as readonly Token[];

describe('FITL card-110 No Contact production spec', () => {
  it('compiles card 110 with rules-accurate text and canonical target structure', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((c) => c.id === CARD_ID);
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'No Contact');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');

    assert.equal(
      card?.unshaded?.text,
      'Place US Casualties on map; flip up to 2 Insurgent Guerrillas Active.',
    );
    assert.equal(
      card?.shaded?.text,
      'Counterdeception: flip up to 2 Active Insurgents Underground; move 2 US Troops to Casualties.',
    );

    // Unshaded uses aggregate target (single-select)
    assert.notEqual(card?.unshaded?.targets, undefined);
    assert.equal(card?.unshaded?.targets?.length, 1);
    const unshadedTarget = card?.unshaded?.targets?.[0];
    assert.equal(unshadedTarget?.id, '$targetSpace');
    assert.equal(unshadedTarget?.application, 'aggregate');
    assert.ok(
      unshadedTarget?.cardinality !== undefined && 'max' in unshadedTarget.cardinality,
      'Unshaded target cardinality should be a range with max',
    );
    assert.equal((unshadedTarget?.cardinality as { max: number }).max, 1);

    // Shaded uses each target (single-select — isSingleSelectTarget returns true)
    assert.notEqual(card?.shaded?.targets, undefined);
    assert.equal(card?.shaded?.targets?.length, 1);
    const shadedTarget = card?.shaded?.targets?.[0];
    assert.equal(shadedTarget?.id, '$targetSpace');
    assert.equal(shadedTarget?.application, 'each');
    assert.ok(
      shadedTarget?.cardinality !== undefined && 'max' in shadedTarget.cardinality,
      'Shaded target cardinality should be a range with max',
    );
    assert.equal((shadedTarget?.cardinality as { max: number }).max, 1);
  });

  it('unshaded places US casualties on selected space and flips up to 2 underground insurgent guerrillas active', () => {
    const def = compileDef();
    const state = setupNoContactState(def, {
      zoneTokens: {
        'hue:none': [
          makeToken('us-trp-hue', 'troops', 'US'),
          makeToken('nva-g-hue-1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('vc-g-hue-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-g-hue-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'casualties-US:none': [
          makeToken('us-cas-1', 'troops', 'US'),
          makeToken('us-cas-2', 'troops', 'US'),
          makeToken('us-cas-3', 'troops', 'US'),
        ],
      },
    });

    const move = findNoContactMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.name === '$targetSpace' || req.decisionId.includes('targetSpace'),
        value: 'hue:none',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });

    // At least some US casualties moved to Hue (removeByPriority budget: 2)
    const usTroopsOnHue = tokensInZone(result.state, 'hue:none').filter(
      (t) => t.props.faction === 'US',
    );
    assert.ok(
      usTroopsOnHue.length >= 2,
      `Expected at least 2 US pieces on Hue after placing casualties, got ${usTroopsOnHue.length}`,
    );

    // Up to 2 underground insurgent guerrillas flipped active
    const activeInsurgents = tokensInZone(result.state, 'hue:none').filter(
      (t) =>
        (t.props.faction === 'NVA' || t.props.faction === 'VC')
        && t.props.type === 'guerrilla'
        && t.props.activity === 'active',
    );
    assert.ok(
      activeInsurgents.length >= 1 && activeInsurgents.length <= 2,
      `Expected 1-2 insurgent guerrillas flipped active, got ${activeInsurgents.length}`,
    );

    // At least one underground guerrilla should remain if 3 were present (limit: 2)
    const undergroundInsurgents = tokensInZone(result.state, 'hue:none').filter(
      (t) =>
        (t.props.faction === 'NVA' || t.props.faction === 'VC')
        && t.props.type === 'guerrilla'
        && t.props.activity === 'underground',
    );
    assert.ok(
      undergroundInsurgents.length >= 1,
      `Expected at least 1 underground guerrilla remaining (limit: 2 flips), got ${undergroundInsurgents.length}`,
    );
  });

  it('unshaded respects flip limit of 2 when more than 2 underground insurgents exist', () => {
    const def = compileDef();
    const state = setupNoContactState(def, {
      zoneTokens: {
        'da-nang:none': [
          makeToken('nva-g-dn-1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('nva-g-dn-2', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('vc-g-dn-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-g-dn-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'casualties-US:none': [
          makeToken('us-cas-1', 'troops', 'US'),
        ],
      },
    });

    const move = findNoContactMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.name === '$targetSpace' || req.decisionId.includes('targetSpace'),
        value: 'da-nang:none',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });

    const activeInsurgents = tokensInZone(result.state, 'da-nang:none').filter(
      (t) =>
        (t.props.faction === 'NVA' || t.props.faction === 'VC')
        && t.props.type === 'guerrilla'
        && t.props.activity === 'active',
    );
    assert.equal(
      activeInsurgents.length,
      2,
      'Exactly 2 underground insurgents should be flipped active (limit: 2)',
    );

    const undergroundInsurgents = tokensInZone(result.state, 'da-nang:none').filter(
      (t) =>
        (t.props.faction === 'NVA' || t.props.faction === 'VC')
        && t.props.type === 'guerrilla'
        && t.props.activity === 'underground',
    );
    assert.equal(
      undergroundInsurgents.length,
      2,
      'Remaining 2 underground insurgents should stay underground',
    );
  });

  it('shaded flips up to 2 active insurgent guerrillas underground and moves 2 US troops to casualties', () => {
    const def = compileDef();
    const state = setupNoContactState(def, {
      zoneTokens: {
        'hue:none': [
          makeToken('us-trp-hue-1', 'troops', 'US'),
          makeToken('us-trp-hue-2', 'troops', 'US'),
          makeToken('us-trp-hue-3', 'troops', 'US'),
          makeToken('nva-g-hue-1', 'guerrilla', 'NVA', { activity: 'active' }),
          makeToken('vc-g-hue-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-g-hue-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = findNoContactMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.name === '$targetSpace' || req.decisionId.includes('targetSpace'),
        value: 'hue:none',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });

    // Up to 2 active insurgent guerrillas should be flipped underground
    const undergroundInsurgents = tokensInZone(result.state, 'hue:none').filter(
      (t) =>
        (t.props.faction === 'NVA' || t.props.faction === 'VC')
        && t.props.type === 'guerrilla'
        && t.props.activity === 'underground',
    );
    assert.equal(
      undergroundInsurgents.length,
      2,
      'Exactly 2 active insurgent guerrillas should be flipped underground (limit: 2)',
    );

    // At least one active insurgent should remain (3 were present, limit: 2)
    const activeInsurgents = tokensInZone(result.state, 'hue:none').filter(
      (t) =>
        (t.props.faction === 'NVA' || t.props.faction === 'VC')
        && t.props.type === 'guerrilla'
        && t.props.activity === 'active',
    );
    assert.equal(
      activeInsurgents.length,
      1,
      'One active insurgent guerrilla should remain (3 present, limit: 2)',
    );

    // 2 US troops should move to casualties
    const casualtyIds = tokenIdsInZone(result.state, 'casualties-US:none');
    const usTroopsMovedToCasualties = ['us-trp-hue-1', 'us-trp-hue-2', 'us-trp-hue-3'].filter(
      (id) => casualtyIds.has(id),
    );
    assert.equal(
      usTroopsMovedToCasualties.length,
      2,
      'Exactly 2 US troops should be moved to casualties',
    );

    // 1 US troop should remain on Hue
    const remainingUsTroops = tokensInZone(result.state, 'hue:none').filter(
      (t) => t.props.faction === 'US' && t.props.type === 'troops',
    );
    assert.equal(
      remainingUsTroops.length,
      1,
      'One US troop should remain on Hue after moving 2 to casualties',
    );
  });

  it('shaded moves fewer US troops when fewer than 2 are present', () => {
    const def = compileDef();
    const state = setupNoContactState(def, {
      zoneTokens: {
        'da-nang:none': [
          makeToken('us-trp-dn-1', 'troops', 'US'),
          makeToken('vc-g-dn-1', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = findNoContactMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.name === '$targetSpace' || req.decisionId.includes('targetSpace'),
        value: 'da-nang:none',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });

    // Only 1 US troop available, so only 1 should move to casualties
    const casualtyIds = tokenIdsInZone(result.state, 'casualties-US:none');
    assert.equal(
      casualtyIds.has('us-trp-dn-1'),
      true,
      'The sole US troop should be moved to casualties',
    );

    const remainingUsTroops = tokensInZone(result.state, 'da-nang:none').filter(
      (t) => t.props.faction === 'US' && t.props.type === 'troops',
    );
    assert.equal(
      remainingUsTroops.length,
      0,
      'No US troops should remain on Da Nang after moving the only one to casualties',
    );

    // The active insurgent should be flipped underground
    const undergroundInsurgents = tokensInZone(result.state, 'da-nang:none').filter(
      (t) =>
        t.props.faction === 'VC'
        && t.props.type === 'guerrilla'
        && t.props.activity === 'underground',
    );
    assert.equal(
      undergroundInsurgents.length,
      1,
      'Active VC guerrilla should be flipped underground',
    );
  });
});
