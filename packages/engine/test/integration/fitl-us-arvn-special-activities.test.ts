import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPlayerId,
  asTokenId,
  ILLEGAL_MOVE_REASONS,
  initialState,
  legalMoves,
  type EffectAST,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, ...extra },
});

const countTokens = (
  state: GameState,
  space: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[space] ?? []).filter(predicate).length;
const findTokenZone = (state: GameState, tokenId: string): string | undefined =>
  Object.entries(state.zones).find(([, tokens]) => tokens.some((token) => token.id === asTokenId(tokenId)))?.[0];

const supportTrackOrder = ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'] as const;
const LOOKAHEAD_ZONE = 'lookahead:none';

const withMonsoonLookahead = (state: GameState): GameState => {
  const lookahead = state.zones[LOOKAHEAD_ZONE] ?? [];
  const [top, ...rest] = lookahead;
  const coupTop: Token = top === undefined
    ? makeToken('monsoon-lookahead', 'card', 'none', { isCoup: true })
    : {
      ...top,
      props: {
        ...top.props,
        isCoup: true,
      },
    };
  return {
    ...state,
    zones: {
      ...state.zones,
      [LOOKAHEAD_ZONE]: [coupTop, ...rest],
    },
  };
};

describe('FITL US/ARVN special activities integration', () => {
  it('compiles US/ARVN special-activity operation profiles with linked windows from production spec', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const profiles = compiled.gameDef!.actionPipelines ?? [];
    const profileSummaries = profiles.map((profile) => ({
      id: profile.id,
      actionId: String(profile.actionId),
      windows: profile.linkedWindows ?? [],
    }));
    for (const expected of [
      { id: 'advise-profile', actionId: 'advise', windows: ['us-special-window'] },
      { id: 'air-lift-profile', actionId: 'airLift', windows: ['us-special-window'] },
      { id: 'air-strike-profile', actionId: 'airStrike', windows: ['us-special-window'] },
      { id: 'govern-profile', actionId: 'govern', windows: ['arvn-special-window'] },
      { id: 'transport-profile', actionId: 'transport', windows: ['arvn-special-window'] },
      { id: 'raid-profile', actionId: 'raid', windows: ['arvn-special-window'] },
    ]) {
      const found = profileSummaries.find((p) => p.id === expected.id);
      assert.ok(found, `Expected profile ${expected.id}`);
      assert.equal(found!.actionId, expected.actionId);
      assert.deepEqual(found!.windows, expected.windows);
    }
  });

  it('defines Air Lift as per-piece multi-destination movement with no shared destination binding', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const profile = (def.actionPipelines ?? []).find((candidate) => candidate.id === 'air-lift-profile');
    assert.ok(profile, 'Expected air-lift-profile to exist');

    const singleDestinationBindings = findDeep(profile!.stages, (node: unknown) => {
      const candidate = node as { chooseOne?: { bind?: unknown } };
      return candidate.chooseOne?.bind === '$airLiftDestination';
    });
    assert.equal(singleDestinationBindings.length, 0, 'Air Lift should not use a single shared destination binding');

    const hasUsSelection = findDeep(profile!.stages, (node: unknown) => {
      const candidate = node as { chooseN?: { bind?: unknown; options?: { query?: unknown } } };
      return candidate.chooseN?.bind === '$usLiftTroops' && candidate.chooseN?.options?.query === 'tokensInMapSpaces';
    });
    assert.ok(hasUsSelection.length >= 1, 'Air Lift should select moveable US troops from selected spaces');

    const hasCoinSelection = findDeep(profile!.stages, (node: unknown) => {
      const candidate = node as { chooseN?: { bind?: unknown; max?: unknown; options?: { query?: unknown } } };
      return candidate.chooseN?.bind === '$coinLiftPieces' && candidate.chooseN?.options?.query === 'concat' && candidate.chooseN?.max === 4;
    });
    assert.ok(hasCoinSelection.length >= 1, 'Air Lift should cap ARVN/Ranger/Irregular movement selection to 4 pieces');

    const hasUsPerPieceDestination = findDeep(profile!.stages, (node: unknown) => {
      const candidate = node as { chooseOne?: { bind?: unknown } };
      return candidate.chooseOne?.bind === '$usLiftDestination@{$usTroop}';
    });
    assert.ok(hasUsPerPieceDestination.length >= 1, 'Air Lift should define per-US-piece destination decisions');

    const hasCoinPerPieceDestination = findDeep(profile!.stages, (node: unknown) => {
      const candidate = node as { chooseOne?: { bind?: unknown } };
      return candidate.chooseOne?.bind === '$coinLiftDestination@{$coinLiftPiece}';
    });
    assert.ok(hasCoinPerPieceDestination.length >= 1, 'Air Lift should define per-COIN-piece destination decisions');

    const hasNorthVietnamExclusion = findDeep(profile!.stages, (node: unknown) => {
      const candidate = node as {
        chooseN?: {
          bind?: unknown;
          options?: {
            query?: unknown;
            filter?: {
              condition?: {
                op?: unknown;
                left?: { ref?: unknown; prop?: unknown };
                right?: unknown;
              };
            };
          };
        };
      };
      return candidate.chooseN?.bind === 'spaces' &&
        candidate.chooseN?.options?.query === 'mapSpaces' &&
        candidate.chooseN?.options?.filter?.condition?.op === '!=' &&
        candidate.chooseN?.options?.filter?.condition?.left?.ref === 'zoneProp' &&
        candidate.chooseN?.options?.filter?.condition?.left?.prop === 'country' &&
        candidate.chooseN?.options?.filter?.condition?.right === 'northVietnam';
    });
    assert.ok(hasNorthVietnamExclusion.length >= 1, 'Air Lift should keep North Vietnam excluded from selected spaces');
  });

  it('executes Advise activate-remove with base-last ordering and optional +6 Aid', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = 'quang-nam:none';

    const start = initialState(def, 113, 4).state;
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...start.globalVars,
        aid: 10,
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('advise-ranger', 'ranger', 'ARVN', { type: 'ranger', activity: 'underground' }),
          makeToken('advise-nva-troop', 'troops', 'NVA', { type: 'troops' }),
          makeToken('advise-vc-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('advise-vc-base-untunneled', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
          makeToken('advise-nva-base-tunneled', 'base', 'NVA', { type: 'base', tunnel: 'tunneled' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('advise'),
      params: {
        targetSpaces: [space],
        [`$adviseMode@${space}`]: 'activate-remove',
        $adviseAid: 'yes',
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.adviseCount, 1);
    assert.equal(final.globalVars.aid, 16);

    const ranger = (final.zones[space] ?? []).find((token) => token.id === asTokenId('advise-ranger'));
    assert.equal(ranger?.props.activity, 'active', 'Advise activate-remove should activate 1 Underground Ranger/Irregular');

    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      0,
      'Advise activate-remove should remove troops first',
    );
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      0,
      'Advise activate-remove should remove enemy guerrillas before bases',
    );
    assert.equal(
      countTokens(final, space, (token) => token.type === 'base' && token.props.faction === 'VC'),
      1,
      'Advise should keep base when non-base insurgents were removed first and budget exhausted',
    );
    assert.equal(
      countTokens(final, space, (token) => token.type === 'base' && token.props.faction === 'NVA' && token.props.tunnel === 'tunneled'),
      1,
      'Advise should not remove tunneled bases',
    );
  });

  it('executes Air Lift with per-piece multi-destination movement and a 4-piece ARVN/Ranger/Irregular cap', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const spaceA = 'da-nang:none';
    const spaceB = 'quang-nam:none';
    const spaceC = 'saigon:none';

    const start = initialState(def, 191, 4).state;
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      zones: {
        ...start.zones,
        [spaceA]: [
          makeToken('lift-us-1', 'troops', 'US', { type: 'troops' }),
          makeToken('lift-us-2', 'troops', 'US', { type: 'troops' }),
          makeToken('lift-arvn-1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('lift-ranger-1', 'ranger', 'ARVN', { type: 'ranger', activity: 'underground' }),
          makeToken('lift-irregular-1', 'irregular', 'US', { type: 'irregular', activity: 'underground' }),
        ],
        [spaceB]: [
          makeToken('lift-us-3', 'troops', 'US', { type: 'troops' }),
          makeToken('lift-arvn-2', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('lift-arvn-3', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('lift-ranger-2', 'ranger', 'ARVN', { type: 'ranger', activity: 'underground' }),
          makeToken('lift-irregular-2', 'irregular', 'US', { type: 'irregular', activity: 'underground' }),
        ],
        [spaceC]: [],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('airLift'),
      params: {
        spaces: [spaceA, spaceB, spaceC],
        $usLiftTroops: ['lift-us-1', 'lift-us-2', 'lift-us-3'],
        '$usLiftDestination@lift-us-1': spaceB,
        '$usLiftDestination@lift-us-2': spaceC,
        '$usLiftDestination@lift-us-3': spaceA,
        $coinLiftPieces: ['lift-arvn-1', 'lift-arvn-2', 'lift-ranger-1', 'lift-irregular-1'],
        '$coinLiftDestination@lift-arvn-1': spaceC,
        '$coinLiftDestination@lift-arvn-2': spaceA,
        '$coinLiftDestination@lift-ranger-1': spaceB,
        '$coinLiftDestination@lift-irregular-1': spaceC,
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.airLiftCount, 1);
    assert.equal(findTokenZone(final, 'lift-us-1'), spaceB);
    assert.equal(findTokenZone(final, 'lift-us-2'), spaceC);
    assert.equal(findTokenZone(final, 'lift-us-3'), spaceA);
    assert.equal(findTokenZone(final, 'lift-arvn-1'), spaceC);
    assert.equal(findTokenZone(final, 'lift-arvn-2'), spaceA);
    assert.equal(findTokenZone(final, 'lift-ranger-1'), spaceB);
    assert.equal(findTokenZone(final, 'lift-irregular-1'), spaceC);

    assert.equal(findTokenZone(final, 'lift-arvn-3'), spaceB, 'Non-selected ARVN troop should remain in place');
    assert.equal(findTokenZone(final, 'lift-ranger-2'), spaceB, 'Non-selected Ranger should remain in place');
    assert.equal(findTokenZone(final, 'lift-irregular-2'), spaceB, 'Non-selected Irregular should remain in place');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, modifiedStart, {
          actionId: asActionId('airLift'),
          params: {
            spaces: [spaceA, spaceB, spaceC],
            $usLiftTroops: [],
            $coinLiftPieces: ['lift-arvn-1', 'lift-arvn-2', 'lift-arvn-3', 'lift-ranger-1', 'lift-irregular-1'],
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain|cardinality mismatch)/,
      'Air Lift should reject selecting more than 4 ARVN/Ranger/Irregular pieces',
    );
  });

  it('executes Air Strike removing up to 6 active enemy pieces, shifting support, and optionally degrading Trail', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const profile = (def.actionPipelines ?? []).find((candidate) => candidate.id === 'air-strike-profile');
    assert.ok(profile, 'Expected air-strike-profile to exist');

    const hasRollRandom = (effects: readonly EffectAST[]): boolean =>
      effects.some((effect) => {
        if ('rollRandom' in effect) return true;
        if ('if' in effect) return hasRollRandom(effect.if.then) || (effect.if.else !== undefined && hasRollRandom(effect.if.else));
        if ('forEach' in effect) return hasRollRandom(effect.forEach.effects) || (effect.forEach.in !== undefined && hasRollRandom(effect.forEach.in));
        if ('let' in effect) return hasRollRandom(effect.let.in);
        if ('removeByPriority' in effect) return effect.removeByPriority.in !== undefined && hasRollRandom(effect.removeByPriority.in);
        return false;
      });
    assert.equal(hasRollRandom(profile!.stages.flatMap((stage) => stage.effects)), true, 'Air Strike should include conditional die roll branches');

    const topGunShadedRollGate = findDeep(profile!.stages, (node: unknown) => {
      const candidate = node as {
        if?: {
          when?: { op?: unknown; left?: { ref?: unknown; marker?: unknown }; right?: unknown };
          then?: unknown[];
        };
      };
      return candidate.if?.when?.op === '==' &&
        candidate.if?.when?.left?.ref === 'globalMarkerState' &&
        candidate.if?.when?.left?.marker === 'cap_topGun' &&
        candidate.if?.when?.right === 'shaded' &&
        findDeep(candidate.if?.then ?? [], (inner: unknown) => {
          const innerCandidate = inner as { rollRandom?: unknown };
          return innerCandidate.rollRandom !== undefined;
        }).length > 0;
    });
    assert.ok(topGunShadedRollGate.length >= 1, 'Expected rollRandom to be gated by cap_topGun shaded branch');

    const space = 'saigon:none';
    const start = initialState(def, 277, 4).state;
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...start.globalVars,
        trail: 2,
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('strike-us-1', 'troops', 'US', { type: 'troops' }),
          makeToken('strike-nva-t1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('strike-nva-t2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('strike-nva-t3', 'troops', 'NVA', { type: 'troops' }),
          makeToken('strike-nva-t4', 'troops', 'NVA', { type: 'troops' }),
          makeToken('strike-vc-active-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('strike-vc-active-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('strike-vc-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('strike-vc-base', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        ],
      },
      markers: {
        ...start.markers,
        [space]: {
          ...(start.markers[space] ?? {}),
          supportOpposition: 'passiveSupport',
        },
      },
    };

    const beforeSupport = modifiedStart.markers[space]?.supportOpposition;

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [space],
        $degradeTrail: 'yes',
      },
    });

    const final = result.state;
    const afterSupport = final.markers[space]?.supportOpposition;

    assert.equal(final.globalVars.airStrikeCount, 1);
    assert.equal(final.globalVars.trail, 1, 'Air Strike should optionally degrade Trail by 1');
    assert.equal(final.globalVars.airStrikeRemaining, 0, 'Air Strike should remove at most 6 active enemy pieces total');

    assert.equal(countTokens(final, space, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 0);
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'active'),
      0,
    );
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'VC' && token.type === 'guerrilla' && token.props.activity === 'underground'),
      1,
      'Air Strike should not remove underground enemy guerrillas',
    );
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'VC' && token.type === 'base'),
      1,
      'Air Strike should not remove bases while underground insurgents remain',
    );

    const beforeIndex = supportTrackOrder.indexOf((beforeSupport ?? 'neutral') as (typeof supportTrackOrder)[number]);
    const afterIndex = supportTrackOrder.indexOf((afterSupport ?? 'neutral') as (typeof supportTrackOrder)[number]);
    assert.equal(afterIndex, Math.max(0, beforeIndex - 1), 'Air Strike should shift selected populated spaces toward opposition');
  });

  it('executes Govern per-space Aid vs Patronage with ARVN>US cube guard for patronage', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const aidSpace = 'qui-nhon:none';
    const patronageSpace = 'can-tho:none';
    const start = initialState(def, 503, 4).state;
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...start.globalVars,
        aid: 20,
        patronage: 10,
      },
      zones: {
        ...start.zones,
        [aidSpace]: [
          makeToken('govern-aid-arvn', 'troops', 'ARVN', { type: 'troops' }),
        ],
        [patronageSpace]: [
          makeToken('govern-pat-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('govern-pat-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('govern-pat-us-t', 'troops', 'US', { type: 'troops' }),
        ],
      },
      markers: {
        ...start.markers,
        [aidSpace]: {
          ...(start.markers[aidSpace] ?? {}),
          supportOpposition: 'activeSupport',
        },
        [patronageSpace]: {
          ...(start.markers[patronageSpace] ?? {}),
          supportOpposition: 'passiveSupport',
        },
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('govern'),
      params: {
        targetSpaces: [aidSpace, patronageSpace],
        [`$governMode@${aidSpace}`]: 'aid',
        [`$governMode@${patronageSpace}`]: 'patronage',
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.governCount, 1);
    assert.equal(final.globalVars.aid, 22, 'Govern should apply +3*Pop Aid in one space and -Pop Aid in patronage space');
    assert.equal(final.globalVars.patronage, 11, 'Govern patronage should add +Pop to Patronage');
    assert.equal(final.markers[patronageSpace]?.supportOpposition, 'neutral', 'Govern patronage should shift support one level toward Neutral');
  });

  it('rejects Govern when selecting Saigon (explicitly excluded by rule)', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const state = initialState(def, 509, 4).state;
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, state, {
          actionId: asActionId('govern'),
          params: {
            targetSpaces: ['saigon:none'],
            '$governMode@saigon:none': 'aid',
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('executes baseline Transport moving ARVN troops and Rangers and flipping all Rangers map-wide', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const origin = 'da-nang:none';
    const destination = 'loc-hue-da-nang:none';
    const remote = 'tay-ninh:none';
    const start = initialState(def, 521, 4).state;
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(1),
      zones: {
        ...start.zones,
        [origin]: [
          makeToken('transport-arvn-t1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('transport-arvn-t2', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('transport-arvn-r1', 'ranger', 'ARVN', { type: 'ranger', activity: 'active' }),
        ],
        [destination]: [],
        [remote]: [
          makeToken('transport-remote-ranger', 'ranger', 'ARVN', { type: 'ranger', activity: 'active' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('transport'),
      params: {
        $transportOrigin: origin,
        $transportDestination: destination,
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.transportCount, 1);
    assert.equal(
      countTokens(final, destination, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      2,
      'Baseline Transport should move ARVN troops from origin to destination',
    );
    const movedRanger = (final.zones[destination] ?? []).find((token) => token.id === asTokenId('transport-arvn-r1'));
    const remoteRanger = (final.zones[remote] ?? []).find((token) => token.id === asTokenId('transport-remote-ranger'));
    assert.notEqual(movedRanger, undefined, 'Baseline Transport should move ARVN Rangers from origin to destination');
    assert.equal(movedRanger?.props.activity, 'underground', 'Baseline Transport should flip moved Rangers Underground');
    assert.equal(remoteRanger?.props.activity, 'underground', 'Baseline Transport should flip remote Rangers Underground');
  });

  it('executes Raid adjacent Ranger movement and optional activate-remove with base-last + tunneled immunity', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const targetSpace = 'quang-nam:none';
    const adjacentSource = 'da-nang:none';
    const start = initialState(def, 557, 4).state;
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(1),
      zones: {
        ...start.zones,
        [adjacentSource]: [
          makeToken('raid-ranger-underground', 'ranger', 'ARVN', { type: 'ranger', activity: 'underground' }),
          makeToken('raid-ranger-active', 'ranger', 'ARVN', { type: 'ranger', activity: 'active' }),
        ],
        [targetSpace]: [
          makeToken('raid-target-troop', 'troops', 'NVA', { type: 'troops' }),
          makeToken('raid-target-guerrilla', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('raid-target-base-untunneled', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
          makeToken('raid-target-base-tunneled', 'base', 'NVA', { type: 'base', tunnel: 'tunneled' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('raid'),
      params: {
        targetSpaces: [targetSpace],
        [`$raidIncomingFrom@${targetSpace}`]: [adjacentSource],
        [`$raidRemove@${targetSpace}`]: 'yes',
      },
    });
    const final = result.state;

    assert.equal(final.globalVars.raidCount, 1);
    assert.equal(
      countTokens(final, targetSpace, (token) => token.props.faction === 'ARVN' && token.type === 'ranger'),
      2,
      'Raid should move adjacent Rangers into selected space',
    );
    assert.equal(
      countTokens(final, targetSpace, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      0,
      'Raid activate-remove should remove enemy troops first',
    );
    assert.equal(
      countTokens(final, targetSpace, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      0,
      'Raid activate-remove should remove enemy guerrillas before bases',
    );
    assert.equal(
      countTokens(final, targetSpace, (token) => token.props.faction === 'VC' && token.type === 'base'),
      1,
      'Raid should keep untunneled base when budget was consumed by non-base pieces',
    );
    assert.equal(
      countTokens(final, targetSpace, (token) => token.props.faction === 'NVA' && token.type === 'base' && token.props.tunnel === 'tunneled'),
      1,
      'Raid should not remove tunneled bases',
    );
  });

  it('rejects advise when accompanied by an operation outside accompanyingOps', () => {
    const { compiled } = compileProductionSpec();

    assert.notEqual(compiled.gameDef, null);

    const state = { ...initialState(compiled.gameDef!, 211, 4).state, activePlayer: asPlayerId(0) };

    assert.throws(
      () => applyMoveWithResolvedDecisionIds(compiled.gameDef!, state, {
        actionId: asActionId('usOp'),
        params: {},
        compound: {
          specialActivity: {
            actionId: asActionId('advise'),
            params: {
              targetSpaces: ['quang-nam:none'],
              '$adviseMode@quang-nam:none': 'assault',
              $adviseAid: 'no',
            },
          },
          timing: 'after',
        },
      }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly message?: string;
          readonly metadata?: {
            readonly code?: string;
            readonly profileId?: string;
          };
        };

        if (details.reason !== undefined) {
          assert.equal(details.reason, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED);
        } else {
          assert.match(String(details.message), /Could not normalize decision params|choiceRuntimeValidationFailed/);
        }
        return true;
      },
    );
  });

  it('rejects Advise during compound Train when SA spaces overlap operation targetSpaces', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);

    const state = initialState(compiled.gameDef!, 339, 4).state;
    const space = 'quang-nam:none';

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(compiled.gameDef!, state, {
          actionId: asActionId('train'),
          params: {
            targetSpaces: [space],
            $trainChoice: 'police',
            $subActionSpaces: [],
          },
          compound: {
            specialActivity: {
              actionId: asActionId('advise'),
              params: {
                targetSpaces: [space],
                [`$adviseMode@${space}`]: 'assault',
                $adviseAid: 'no',
              },
            },
            timing: 'after',
          },
        }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly message?: string;
          readonly metadata?: { readonly relation?: string };
        };
        if (details.reason !== undefined) {
          assert.equal(details.reason, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED);
          assert.equal(details.metadata?.relation, 'disjoint');
        } else {
          assert.match(String(details.message), /Could not normalize decision params|choiceRuntimeValidationFailed/);
        }
        return true;
      },
    );
  });

  it('supports per-space Advise mode choices in a single action', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const spaceActivate = 'quang-nam:none';
    const spaceAssault = 'saigon:none';
    const start = initialState(def, 441, 4).state;
    const modifiedStart: GameState = {
      ...start,
      zones: {
        ...start.zones,
        [spaceActivate]: [
          makeToken('multi-ranger', 'ranger', 'ARVN', { type: 'ranger', activity: 'underground' }),
          makeToken('multi-activate-target-1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('multi-activate-target-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
        ],
        [spaceAssault]: [
          makeToken('multi-arvn-troop-1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('multi-arvn-troop-2', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('multi-assault-target-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('advise'),
      params: {
        targetSpaces: [spaceActivate, spaceAssault],
        [`$adviseMode@${spaceActivate}`]: 'activate-remove',
        [`$adviseMode@${spaceAssault}`]: 'assault',
        $targetFactionFirst: 'VC',
        $adviseAid: 'no',
      },
    });
    const final = result.state;

    const ranger = (final.zones[spaceActivate] ?? []).find((token) => token.id === asTokenId('multi-ranger'));
    assert.equal(ranger?.props.activity, 'active');
    assert.equal(
      countTokens(final, spaceActivate, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
      0,
      'Activate-remove branch should clear both enemy pieces in first space',
    );
    assert.equal(
      countTokens(final, spaceAssault, (token) => token.props.faction === 'VC'),
      0,
      'Assault branch should remove enemy in second space',
    );
  });

  it('disallows Advise sweep mode during Monsoon but still allows two non-sweep spaces', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const spaceA = 'quang-nam:none';
    const spaceB = 'saigon:none';

    const monsoonState = { ...withMonsoonLookahead(initialState(def, 449, 4).state), activePlayer: asPlayerId(0) };
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, monsoonState, {
          actionId: asActionId('advise'),
          params: {
            targetSpaces: [spaceA],
            [`$adviseMode@${spaceA}`]: 'sweep',
            $adviseAid: 'no',
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    assert.doesNotThrow(() =>
      applyMoveWithResolvedDecisionIds(def, monsoonState, {
        actionId: asActionId('advise'),
        params: {
          targetSpaces: [spaceA, spaceB],
          [`$adviseMode@${spaceA}`]: 'activate-remove',
          [`$adviseMode@${spaceB}`]: 'assault',
          $adviseAid: 'no',
        },
      }),
    );
  });

  it('enforces Monsoon Air Lift and Air Strike caps at two selected spaces', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const spaceA = 'da-nang:none';
    const spaceB = 'quang-nam:none';
    const spaceC = 'saigon:none';

    const seeded = initialState(def, 457, 4).state;
    const monsoonState = withMonsoonLookahead({
      ...seeded,
      activePlayer: asPlayerId(0),
      zones: {
        ...seeded.zones,
        [spaceA]: [makeToken('monsoon-us-a', 'troops', 'US', { type: 'troops' })],
        [spaceB]: [makeToken('monsoon-us-b', 'troops', 'US', { type: 'troops' })],
        [spaceC]: [makeToken('monsoon-us-c', 'troops', 'US', { type: 'troops' })],
      },
    });

    assert.doesNotThrow(() =>
      applyMoveWithResolvedDecisionIds(def, monsoonState, {
        actionId: asActionId('airLift'),
        params: {
          spaces: [spaceA, spaceB],
        },
      }),
    );
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, monsoonState, {
          actionId: asActionId('airLift'),
          params: {
            spaces: [spaceA, spaceB, spaceC],
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    assert.doesNotThrow(() =>
      applyMoveWithResolvedDecisionIds(def, monsoonState, {
        actionId: asActionId('airStrike'),
        params: {
          spaces: [spaceA, spaceB],
          $degradeTrail: 'no',
        },
      }),
    );
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, monsoonState, {
          actionId: asActionId('airStrike'),
          params: {
            spaces: [spaceA, spaceB, spaceC],
            $degradeTrail: 'no',
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('blocks Sweep and March action selection during Monsoon turn-flow window', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const baselineState = initialState(def, 461, 4).state;
    const monsoonState = withMonsoonLookahead(baselineState);
    const baselineMoves = legalMoves(def, baselineState);
    const moves = legalMoves(def, monsoonState);

    const baselineHasSweep = baselineMoves.some((move) => move.actionId === asActionId('sweep'));
    const baselineHasMarch = baselineMoves.some((move) => move.actionId === asActionId('march'));
    assert.equal(
      baselineHasSweep || baselineHasMarch,
      true,
      'Fixture seed should expose at least one Monsoon-restricted operation in baseline legal moves',
    );
    if (baselineHasSweep) {
      assert.equal(
        moves.some((move) => move.actionId === asActionId('sweep')),
        false,
        'Monsoon should block Sweep action selection',
      );
    }
    if (baselineHasMarch) {
      assert.equal(
        moves.some((move) => move.actionId === asActionId('march')),
        false,
        'Monsoon should block March action selection',
      );
    }
  });
});
