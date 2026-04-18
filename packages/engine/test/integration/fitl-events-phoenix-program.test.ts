// @test-class: architectural-invariant
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
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const makeToken = (
  id: string,
  type: 'troops' | 'police' | 'guerrilla' | 'base' | 'card',
  faction: 'US' | 'ARVN' | 'NVA' | 'VC' | 'none',
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

const setupPhoenixState = (
  def: GameDef,
  side: 'unshaded' | 'shaded',
  overrides: {
    readonly aid?: number;
    readonly arvnResources?: number;
    readonly terrorSabotageMarkersPlaced?: number;
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly zoneVars?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

  const base = clearAllZones(initialState(def, 27001, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      aid: overrides.aid ?? (base.globalVars.aid as number | undefined) ?? 0,
      arvnResources: overrides.arvnResources ?? (base.globalVars.arvnResources as number | undefined) ?? 0,
      terrorSabotageMarkersPlaced:
        overrides.terrorSabotageMarkersPlaced ?? (base.globalVars.terrorSabotageMarkersPlaced as number | undefined) ?? 0,
    },
    markers: {
      ...base.markers,
      ...overrides.markers,
    },
    zoneVars: {
      ...base.zoneVars,
      ...overrides.zoneVars,
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken('card-27', 'card', 'none')],
      ...overrides.zoneTokens,
    },
  };
};

const findPhoenixMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-27'),
  );

const tokenIdsInZone = (state: GameState, zoneId: string): Set<string> =>
  new Set((state.zones[zoneId] ?? []).map((token) => String(token.id)));

describe('FITL card-27 Phoenix Program production spec', () => {
  it('compiles card 27 with rules-accurate text and declarative effects', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const phoenix = compiled.gameDef?.eventDecks?.[0]?.cards.find((card) => card.id === 'card-27');
    assert.notEqual(phoenix, undefined);
    assert.equal(phoenix?.title, 'Phoenix Program');
    assert.equal(phoenix?.sideMode, 'dual');
    assert.equal(phoenix?.metadata?.period, '1968');
    assert.deepEqual(phoenix?.metadata?.seatOrder, ['US', 'VC', 'ARVN', 'NVA']);
    assert.equal(
      phoenix?.unshaded?.text,
      'Remove any 3 VC pieces total from any COIN Control spaces.',
    );
    assert.equal(
      phoenix?.shaded?.text,
      'Add a Terror marker to any 2 spaces outside Saigon with COIN Control and VC. Set them to Active Opposition.',
    );
    assert.equal(phoenix?.unshaded?.targets, undefined);
    assert.notEqual(phoenix?.shaded?.targets, undefined, 'Shaded Phoenix should use canonical targets');
    assert.equal(phoenix?.shaded?.targets?.length, 1, 'Shaded Phoenix should have one target selector');
    assert.equal(phoenix?.shaded?.targets?.[0]?.id, '$targetSpace');
    assert.equal(phoenix?.shaded?.targets?.[0]?.application, 'each');

    const unshadedChoose = phoenix?.unshaded?.effects?.[0];
    assert.ok(unshadedChoose !== undefined && 'chooseN' in unshadedChoose);
    assert.equal('chooseN' in unshadedChoose ? unshadedChoose.chooseN.bind : '', '$vcPiecesToRemove');
    const unshadedChooseN = 'chooseN' in unshadedChoose ? unshadedChoose.chooseN : undefined;
    assert.equal(unshadedChooseN?.options?.query, 'tokensInMapSpaces');
    assert.equal(
      (unshadedChooseN?.options as { sources?: unknown[] } | undefined)?.sources,
      undefined,
      'Unshaded Phoenix should not use concat workaround sources',
    );
    const unshadedFilter = (unshadedChooseN?.options as { filter?: { op?: string; args?: unknown[] } } | undefined)?.filter;
    assert.equal(unshadedFilter?.op, 'and');
    const tokenTypeClause = unshadedFilter?.args?.find(
      (arg) => typeof arg === 'object' && arg !== null && 'op' in arg && (arg as { op?: string }).op === 'or',
    ) as { op?: string; args?: unknown[] } | undefined;
    assert.notEqual(tokenTypeClause, undefined);
    assert.equal(tokenTypeClause?.op, 'or');
  });

  it('unshaded removes selected VC guerrillas and unTunneled bases from COIN-controlled spaces only', () => {
    const def = compileDef();
    const state = setupPhoenixState(def, 'unshaded', {
      zoneTokens: {
        'hue:none': [
          makeToken('us-trp-hue', 'troops', 'US'),
          makeToken('us-trp-hue-2', 'troops', 'US'),
          makeToken('arvn-pol-hue', 'police', 'ARVN'),
          makeToken('arvn-pol-hue-2', 'police', 'ARVN'),
          makeToken('vc-g-hue', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('vc-b-hue', 'base', 'VC', { tunnel: 'untunneled' }),
          makeToken('vc-b-hue-tunnel', 'base', 'VC', { tunnel: 'tunneled' }),
        ],
        'da-nang:none': [
          makeToken('us-trp-dn', 'troops', 'US'),
          makeToken('arvn-pol-dn', 'police', 'ARVN'),
          makeToken('vc-g-dn', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        'pleiku:none': [
          makeToken('us-trp-pleiku', 'troops', 'US'),
          makeToken('vc-g-pleiku', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-b-pleiku', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
    });
    const move = findPhoenixMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$vcPiecesToRemove', resolvedBind: '$vcPiecesToRemove' }),
        value: [asTokenId('vc-g-hue'), asTokenId('vc-b-hue'), asTokenId('vc-g-dn')],
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });

    const hueIds = tokenIdsInZone(result.state, 'hue:none');
    const daNangIds = tokenIdsInZone(result.state, 'da-nang:none');
    const pleikuIds = tokenIdsInZone(result.state, 'pleiku:none');
    const availableVcIds = tokenIdsInZone(result.state, 'available-VC:none');

    assert.equal(hueIds.has('vc-g-hue'), false, 'Selected VC guerrilla should be removed from Hue');
    assert.equal(hueIds.has('vc-b-hue'), false, 'Selected unTunneled VC base should be removed from Hue');
    assert.equal(daNangIds.has('vc-g-dn'), false, 'Selected VC guerrilla should be removed from Da Nang');
    assert.equal(
      hueIds.has('vc-b-hue-tunnel'),
      true,
      'Tunneled VC base should not be removable by this event',
    );
    assert.equal(
      pleikuIds.has('vc-g-pleiku'),
      true,
      'VC piece in non-COIN-controlled space should remain',
    );
    assert.equal(availableVcIds.has('vc-g-hue'), true);
    assert.equal(availableVcIds.has('vc-b-hue'), true);
    assert.equal(availableVcIds.has('vc-g-dn'), true);
  });

  it('unshaded removes as many as possible when fewer than 3 eligible VC pieces exist', () => {
    const def = compileDef();
    const state = setupPhoenixState(def, 'unshaded', {
      zoneTokens: {
        'hue:none': [
          makeToken('us-trp-hue', 'troops', 'US'),
          makeToken('arvn-pol-hue', 'police', 'ARVN'),
          makeToken('arvn-pol-hue-2', 'police', 'ARVN'),
          makeToken('vc-g-hue', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-b-hue', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
    });
    const move = findPhoenixMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$vcPiecesToRemove', resolvedBind: '$vcPiecesToRemove' }),
        value: [asTokenId('vc-g-hue'), asTokenId('vc-b-hue')],
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });

    const hueIds = tokenIdsInZone(result.state, 'hue:none');
    const availableVcIds = tokenIdsInZone(result.state, 'available-VC:none');
    assert.equal(hueIds.has('vc-g-hue'), false);
    assert.equal(hueIds.has('vc-b-hue'), false);
    assert.equal(availableVcIds.has('vc-g-hue'), true);
    assert.equal(availableVcIds.has('vc-b-hue'), true);
  });

  it('shaded targets only eligible spaces outside Saigon, adds Terror when absent, and sets Active Opposition', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 27002, 4).state);
    const state = setupPhoenixState(def, 'shaded', {
      terrorSabotageMarkersPlaced: 4,
      zoneTokens: {
        'hue:none': [
          makeToken('us-trp-hue', 'troops', 'US'),
          makeToken('arvn-pol-hue', 'police', 'ARVN'),
          makeToken('vc-g-hue', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        'da-nang:none': [
          makeToken('us-trp-dn', 'troops', 'US'),
          makeToken('arvn-pol-dn', 'police', 'ARVN'),
          makeToken('vc-g-dn', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        'saigon:none': [
          makeToken('us-trp-sgn', 'troops', 'US'),
          makeToken('arvn-pol-sgn', 'police', 'ARVN'),
          makeToken('vc-g-sgn', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        'pleiku:none': [
          makeToken('us-trp-pleiku', 'troops', 'US'),
          makeToken('vc-g-pleiku', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-b-pleiku', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
      markers: {
        'hue:none': { supportOpposition: 'passiveSupport' },
        'da-nang:none': { supportOpposition: 'neutral' },
        'saigon:none': { supportOpposition: 'passiveSupport' },
      },
      zoneVars: {
        ...base.zoneVars,
        'hue:none': { ...(base.zoneVars['hue:none'] ?? {}), terrorCount: 0 },
        'da-nang:none': { ...(base.zoneVars['da-nang:none'] ?? {}), terrorCount: 1 },
        'saigon:none': { ...(base.zoneVars['saigon:none'] ?? {}), terrorCount: 0 },
      },
    });
    const move = findPhoenixMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$targetSpace', resolvedBind: '$targetSpace' }),
        value: ['hue:none', 'da-nang:none'],
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });

    assert.equal(result.state.markers['hue:none']?.supportOpposition, 'activeOpposition');
    assert.equal(result.state.markers['da-nang:none']?.supportOpposition, 'activeOpposition');
    assert.equal(
      result.state.markers['saigon:none']?.supportOpposition,
      'passiveSupport',
      'Saigon should remain untouched (outside Saigon only)',
    );
    assert.equal(result.state.zoneVars?.['hue:none']?.terrorCount, 1, 'Hue should gain Terror marker');
    assert.equal(
      result.state.zoneVars?.['da-nang:none']?.terrorCount,
      1,
      'Da Nang already had Terror and should not gain an additional marker',
    );
    assert.equal(
      result.state.globalVars.terrorSabotageMarkersPlaced,
      5,
      'Global terror marker count should increase by one (Hue only)',
    );
  });

  it('shaded still sets Active Opposition even when no Terror markers remain in pool', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 27003, 4).state);
    const state = setupPhoenixState(def, 'shaded', {
      terrorSabotageMarkersPlaced: 15,
      zoneTokens: {
        'hue:none': [
          makeToken('us-trp-hue', 'troops', 'US'),
          makeToken('arvn-pol-hue', 'police', 'ARVN'),
          makeToken('vc-g-hue', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
      markers: {
        'hue:none': { supportOpposition: 'neutral' },
      },
      zoneVars: {
        ...base.zoneVars,
        'hue:none': { ...(base.zoneVars['hue:none'] ?? {}), terrorCount: 0 },
      },
    });
    const move = findPhoenixMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ name: '$targetSpace', resolvedBind: '$targetSpace' }),
        value: ['hue:none'],
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });

    assert.equal(result.state.markers['hue:none']?.supportOpposition, 'activeOpposition');
    assert.equal(result.state.zoneVars?.['hue:none']?.terrorCount, 0);
    assert.equal(result.state.globalVars.terrorSabotageMarkersPlaced, 15);
  });
});
