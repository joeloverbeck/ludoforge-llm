import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type LeaderState = 'minh' | 'khanh' | 'youngTurks' | 'ky' | 'thieu';
type MarkerState = 'inactive' | 'unshaded' | 'shaded';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type, ...extra },
});

const compileDef = (): { parsed: ReturnType<typeof compileProductionSpec>['parsed']; def: GameDef } => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return { parsed, def: compiled.gameDef! };
};

const withActivePlayer = (state: GameState, player: 0 | 1 | 2 | 3): GameState => ({
  ...state,
  activePlayer: asPlayerId(player),
  turnOrderState: { type: 'roundRobin' },
});

const withGlobalMarker = (state: GameState, marker: string, value: string): GameState => ({
  ...state,
  globalMarkers: {
    ...(state.globalMarkers ?? {}),
    [marker]: value,
  },
});

const withLeader = (state: GameState, leader: LeaderState): GameState => withGlobalMarker(state, 'activeLeader', leader);

const withMomentum = (state: GameState, vars: Record<string, boolean>): GameState => ({
  ...state,
  globalVars: {
    ...state.globalVars,
    ...vars,
  },
});

const enemyCount = (state: GameState, space: string): number =>
  (state.zones[space] ?? []).filter((token) => token.props.faction === 'NVA' || token.props.faction === 'VC').length;

const arvnPoliceCount = (state: GameState, space: string): number =>
  (state.zones[space] ?? []).filter((token) => token.props.faction === 'ARVN' && token.type === 'police').length;

describe('FITL cross-system modifier smoke', () => {
  it('keeps Air Strike illegal under rolling thunder even with cap_arcLight unshaded active', () => {
    const { def } = compileDef();

    const base = withGlobalMarker(withActivePlayer(initialState(def, 11001, 4).state, 0), 'cap_arcLight', 'unshaded');

    assert.doesNotThrow(() =>
      applyMoveWithResolvedDecisionIds(def, base, {
        actionId: asActionId('airStrike'),
        params: { $spaces: [], $degradeTrail: 'no' },
      }),
    );

    const blocked = withMomentum(base, { mom_rollingThunder: true });
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, blocked, {
          actionId: asActionId('airStrike'),
          params: { $spaces: [], $degradeTrail: 'no' },
        }),
      /Illegal move/,
      'Momentum prohibition must take precedence over capability side effects',
    );
  });

  it('applies multiple Air Strike capabilities in one resolution path (Top Gun + LGBs)', () => {
    const { def } = compileDef();
    const space = 'saigon:none';

    const start = withActivePlayer(initialState(def, 11002, 4).state, 0);
    const configured: GameState = {
      ...withGlobalMarker(withGlobalMarker(start, 'cap_topGun', 'unshaded'), 'cap_lgbs', 'shaded'),
      globalVars: {
        ...start.globalVars,
        trail: 3,
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('smoke-us-t', 'troops', 'US', { type: 'troops' }),
          makeToken('smoke-nva-t1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('smoke-nva-t2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('smoke-vc-g1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('smoke-vc-g2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('smoke-vc-g3', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, configured, {
      actionId: asActionId('airStrike'),
      params: {
        $spaces: [space],
        $degradeTrail: 'yes',
      },
    }).state;

    assert.equal(result.globalVars.trail, 1, 'Top Gun unshaded should degrade Trail by 2');
    assert.equal(enemyCount(configured, space) - enemyCount(result, space), 4, 'LGBs shaded should cap removals at exactly 4');
  });

  it('keeps Minh Train bonus independent from CAPs unshaded on ARVN Train', () => {
    const { def } = compileDef();
    const space = 'qui-nhon:none';
    const arvnAvailable = 'available-ARVN:none';

    const base = withActivePlayer(clearAllZones(initialState(def, 11003, 4).state), 1);
    const setup: GameState = {
      ...base,
      globalVars: {
        ...base.globalVars,
        aid: 20,
      },
      zones: {
        ...base.zones,
        [space]: [
          makeToken('smoke-arvn-train-t', 'troops', 'ARVN', { type: 'troops' }),
        ],
        [arvnAvailable]: [makeToken('smoke-arvn-police-available', 'police', 'ARVN', { type: 'police' })],
      },
    };

    const run = (caps: MarkerState): GameState =>
      applyMoveWithResolvedDecisionIds(def, withGlobalMarker(withLeader(setup, 'minh'), 'cap_caps', caps), {
        actionId: asActionId('train'),
        params: {
          $targetSpaces: [space],
          $trainChoice: 'rangers',
          $subActionSpaces: [],
        },
      }).state;

    const inactive = run('inactive');
    const unshaded = run('unshaded');

    assert.equal(inactive.globalVars.aid, 25, 'Minh bonus should apply in control case');
    assert.equal(unshaded.globalVars.aid, 25, 'Minh bonus should still apply with CAPs active');
    assert.equal(
      arvnPoliceCount(unshaded, space),
      arvnPoliceCount(inactive, space),
      'CAPs unshaded should not add ARVN Train police bonus (card text scopes to US Training)',
    );
  });

  it('keeps Ky pacification cost override active while cap_cords unshaded branch remains present', () => {
    const { parsed, def } = compileDef();
    const space = 'can-tho:none';

    const trainArvn = parsed.doc.actionPipelines?.find((profile) => profile.id === 'train-arvn-profile');
    assert.ok(trainArvn, 'Expected train-arvn-profile in production doc');
    const capCordsUnshadedChecks = findDeep(trainArvn, (node) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_cords' &&
      node?.if?.when?.right === 'unshaded',
    );
    assert.ok(capCordsUnshadedChecks.length >= 1, 'Expected cap_cords unshaded branch in ARVN Train');

    const runPacify = (leader: LeaderState, seed: number): number => {
      const base = withActivePlayer(clearAllZones(initialState(def, seed, 4).state), 1);
      const setup: GameState = {
        ...base,
        globalVars: {
          ...base.globalVars,
          arvnResources: 20,
        },
        zones: {
          ...base.zones,
          [space]: [
            makeToken(`smoke-pacify-${leader}-t`, 'troops', 'ARVN', { type: 'troops' }),
            makeToken(`smoke-pacify-${leader}-p`, 'police', 'ARVN', { type: 'police' }),
          ],
        },
        markers: {
          ...base.markers,
          [space]: {
            ...(base.markers[space] ?? {}),
            supportOpposition: 'neutral',
            terror: 'none',
          },
        },
      };

      const final = applyMoveWithResolvedDecisionIds(
        def,
        withGlobalMarker(withLeader(withGlobalMarker(setup, 'cap_cords', 'unshaded'), leader), 'cap_cords', 'unshaded'),
        {
          actionId: asActionId('train'),
          params: {
            $targetSpaces: [space],
            $trainChoice: 'rangers',
            $subActionSpaces: [space],
            $subAction: 'pacify',
            $pacLevels: 1,
          },
        },
      ).state;

      return Number(final.globalVars.arvnResources ?? 0);
    };

    const kyResources = runPacify('ky', 11004);
    const thieuResources = runPacify('thieu', 11005);

    assert.equal(thieuResources - kyResources, 1, 'Ky should still increase per-level pacification cost by 1 with CORDS active');
  });

  it('caps CORDS shaded US Train pacification at Passive Support from Neutral with one-level cost', () => {
    const { def } = compileDef();
    const space = 'can-tho:none';

    const base = withActivePlayer(clearAllZones(initialState(def, 11007, 4).state), 0);
    const setup: GameState = {
      ...base,
      globalVars: {
        ...base.globalVars,
        arvnResources: 20,
      },
      globalMarkers: {
        ...base.globalMarkers,
        activeLeader: 'thieu',
        cap_cords: 'shaded',
      },
      zones: {
        ...base.zones,
        [space]: [makeToken('cords-shaded-us', 'troops', 'US', { type: 'troops' })],
      },
      markers: {
        ...base.markers,
        [space]: {
          ...(base.markers[space] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      zoneVars: {
        ...base.zoneVars,
        [space]: {
          ...(base.zoneVars[space] ?? {}),
          terrorCount: 0,
        },
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('train'),
      params: {
        $targetSpaces: [space],
        $trainChoice: 'place-irregulars',
        $subActionSpaces: [space],
        $subAction: 'pacify',
      },
    }).state;

    assert.equal(final.markers[space]?.supportOpposition, 'passiveSupport');
    assert.equal(
      Number(final.globalVars.arvnResources ?? 0),
      17,
      'Shaded CORDS from neutral should spend exactly one pacification level (3 under Thieu)',
    );
  });

  it('keeps CORDS shaded pacification costs per Terror marker and per level (US Train)', () => {
    const { def } = compileDef();
    const space = 'qui-nhon:none';

    const base = withActivePlayer(clearAllZones(initialState(def, 11008, 4).state), 0);
    const setup: GameState = {
      ...base,
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      globalMarkers: {
        ...base.globalMarkers,
        activeLeader: 'ky',
        cap_cords: 'shaded',
      },
      zones: {
        ...base.zones,
        [space]: [makeToken('cords-shaded-ky-us', 'troops', 'US', { type: 'troops' })],
      },
      markers: {
        ...base.markers,
        [space]: {
          ...(base.markers[space] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      zoneVars: {
        ...base.zoneVars,
        [space]: {
          ...(base.zoneVars[space] ?? {}),
          terrorCount: 1,
        },
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('train'),
      params: {
        $targetSpaces: [space],
        $trainChoice: 'place-irregulars',
        $subActionSpaces: [space],
        $subAction: 'pacify',
      },
    }).state;

    assert.equal(Number(final.globalVars.arvnResources ?? 0), 22, 'Ky should still charge 4 per Terror and 4 per level under shaded CORDS');
    assert.equal(Number(final.zoneVars[space]?.terrorCount ?? 0), 0, 'Shaded CORDS pacify should still remove Terror before support shift');
    assert.equal(final.markers[space]?.supportOpposition, 'passiveSupport');
  });

  it('allows CORDS shaded to shift opposition by up to 2 levels without hard-setting support', () => {
    const { def } = compileDef();
    const space = 'hue:none';

    const base = withActivePlayer(clearAllZones(initialState(def, 11009, 4).state), 0);
    const setup: GameState = {
      ...base,
      globalVars: {
        ...base.globalVars,
        arvnResources: 30,
      },
      globalMarkers: {
        ...base.globalMarkers,
        activeLeader: 'thieu',
        cap_cords: 'shaded',
      },
      zones: {
        ...base.zones,
        [space]: [makeToken('cords-shaded-us-opp', 'troops', 'US', { type: 'troops' })],
      },
      markers: {
        ...base.markers,
        [space]: {
          ...(base.markers[space] ?? {}),
          supportOpposition: 'passiveOpposition',
        },
      },
      zoneVars: {
        ...base.zoneVars,
        [space]: {
          ...(base.zoneVars[space] ?? {}),
          terrorCount: 0,
        },
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('train'),
      params: {
        $targetSpaces: [space],
        $trainChoice: 'place-irregulars',
        $subActionSpaces: [space],
        $subAction: 'pacify',
        $pacLevels: 2,
      },
    }).state;

    assert.equal(final.markers[space]?.supportOpposition, 'passiveSupport');
    assert.equal(Number(final.globalVars.arvnResources ?? 0), 24, 'Two shaded CORDS pacification levels should cost 6 under Thieu');
  });

  it('keeps Air Lift prohibited when multiple Air Lift blockers are active together', () => {
    const { def } = compileDef();

    const base = withActivePlayer(initialState(def, 11006, 4).state, 0);
    const blocked = withMomentum(base, { mom_medevacShaded: true, mom_typhoonKate: true });

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, blocked, {
          actionId: asActionId('airLift'),
          params: {
            $spaces: ['saigon:none'],
          },
        }),
      /Illegal move/,
    );
  });
});
