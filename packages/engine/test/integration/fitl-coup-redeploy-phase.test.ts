import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  applyMove,
  asActionId,
  asPhaseId,
  asTokenId,
  initialState,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const compileProductionDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  assert.notEqual(compiled.gameDef, null);
  return structuredClone(compiled.gameDef!);
};

const withClearedZones = (state: GameState): GameState => ({
  ...state,
  zones: Object.fromEntries(Object.keys(state.zones).map((zoneId) => [zoneId, []])),
});

const piece = (id: string, faction: string, pieceType: string): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: { faction, type: pieceType },
});

const card = (id: string, isCoup: boolean): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { isCoup },
});

const withCoupPhase = (
  base: GameState,
  options: {
    readonly phase: GameState['currentPhase'];
    readonly activePlayer?: GameState['activePlayer'];
    readonly zones?: Partial<GameState['zones']>;
  },
): GameState => ({
  ...base,
  currentPhase: options.phase,
  activePlayer: options.activePlayer ?? base.activePlayer,
  zones: {
    ...base.zones,
    'played:none': [card('played-coup', true)],
    'lookahead:none': [card('lookahead-event', false)],
    'deck:none': [card('deck-event', false)],
    ...(options.zones ?? {}),
  },
});

const countPieces = (state: GameState, zoneId: string, faction: string, pieceType: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => token.props.faction === faction && token.props.type === pieceType).length;

const countFactionInZone = (state: GameState, zoneId: string, faction: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => token.props.faction === faction).length;

describe('FITL coup redeploy phase (Rule 6.4)', () => {
  it('defines production redeploy actions', () => {
    const def = compileProductionDef();
    const ids = new Set(def.actions.map((action) => String(action.id)));

    assert.equal(ids.has('coupArvnRedeployMandatory'), true);
    assert.equal(ids.has('coupArvnRedeployOptionalTroops'), true);
    assert.equal(ids.has('coupArvnRedeployPolice'), true);
    assert.equal(ids.has('coupNvaRedeployTroops'), true);
  });

  it('removes all US/ARVN pieces from Laos/Cambodia on coupRedeploy phase entry', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8801, 4).state);
    const state = withCoupPhase(base, {
      phase: asPhaseId('coupSupport'),
      activePlayer: 1 as GameState['activePlayer'],
      zones: {
        'central-laos:none': [
          piece('us-t-1', 'US', 'troops'),
          piece('us-b-1', 'US', 'base'),
          piece('us-i-1', 'US', 'irregular'),
          piece('arvn-t-1', 'ARVN', 'troops'),
          piece('arvn-p-1', 'ARVN', 'police'),
        ],
        'northeast-cambodia:none': [
          piece('us-t-2', 'US', 'troops'),
          piece('arvn-b-1', 'ARVN', 'base'),
        ],
      },
    });

    const entered = advancePhase(def, state);

    assert.equal(entered.currentPhase, asPhaseId('coupRedeploy'));
    assert.equal(countFactionInZone(entered, 'central-laos:none', 'US'), 0);
    assert.equal(countFactionInZone(entered, 'central-laos:none', 'ARVN'), 0);
    assert.equal(countFactionInZone(entered, 'northeast-cambodia:none', 'US'), 0);
    assert.equal(countFactionInZone(entered, 'northeast-cambodia:none', 'ARVN'), 0);

    assert.equal(countPieces(entered, 'out-of-play-US:none', 'US', 'troops'), 2);
    assert.equal(countPieces(entered, 'available-US:none', 'US', 'base'), 1);
    assert.equal(countPieces(entered, 'available-US:none', 'US', 'irregular'), 1);
    assert.equal(countPieces(entered, 'available-ARVN:none', 'ARVN', 'troops'), 1);
    assert.equal(countPieces(entered, 'available-ARVN:none', 'ARVN', 'police'), 1);
    assert.equal(countPieces(entered, 'available-ARVN:none', 'ARVN', 'base'), 1);
  });

  it('enforces ARVN mandatory troop redeploy before optional troop redeploy and destination constraints', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8802, 4).state);
    const state = withCoupPhase(base, {
      phase: asPhaseId('coupRedeploy'),
      activePlayer: 1 as GameState['activePlayer'],
      zones: {
        'loc-hue-da-nang:none': [piece('arvn-mandatory', 'ARVN', 'troops')],
        'saigon:none': [piece('arvn-optional', 'ARVN', 'troops')],
      },
    });

    assert.throws(() => applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployOptionalTroops'),
      params: {
        sourceSpace: 'saigon:none',
        targetSpace: 'hue:none',
      },
    }));

    assert.throws(() => applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployMandatory'),
      params: {
        sourceSpace: 'loc-hue-da-nang:none',
        targetSpace: 'quang-nam:none',
      },
    }));

    const afterMandatory = applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployMandatory'),
      params: {
        sourceSpace: 'loc-hue-da-nang:none',
        targetSpace: 'saigon:none',
      },
    }).state;

    assert.equal(countPieces(afterMandatory, 'loc-hue-da-nang:none', 'ARVN', 'troops'), 0);

    assert.equal(countPieces(afterMandatory, 'loc-hue-da-nang:none', 'ARVN', 'troops'), 0);
  });

  it('allows ARVN police redeploy only to South Vietnam LoCs or COIN-controlled spaces', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8803, 4).state);
    const state = withCoupPhase(base, {
      phase: asPhaseId('coupRedeploy'),
      activePlayer: 1 as GameState['activePlayer'],
      zones: {
        'quang-nam:none': [piece('arvn-police-1', 'ARVN', 'police')],
      },
    });

    const movedToLoc = applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployPolice'),
      params: {
        sourceSpace: 'quang-nam:none',
        targetSpace: 'loc-hue-da-nang:none',
      },
    }).state;

    assert.equal(countPieces(movedToLoc, 'loc-hue-da-nang:none', 'ARVN', 'police'), 1);

    assert.throws(() => applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployPolice'),
      params: {
        sourceSpace: 'quang-nam:none',
        targetSpace: 'central-laos:none',
      },
    }));
  });

  it('allows NVA redeploy of troops only and only to spaces with NVA bases', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 8804, 4).state);
    const state = withCoupPhase(base, {
      phase: asPhaseId('coupRedeploy'),
      activePlayer: 2 as GameState['activePlayer'],
      zones: {
        'quang-tri-thua-thien:none': [
          piece('nva-t-1', 'NVA', 'troops'),
          piece('nva-g-1', 'NVA', 'guerrilla'),
        ],
        'central-laos:none': [piece('nva-b-1', 'NVA', 'base')],
      },
    });

    const moved = applyMove(def, state, {
      actionId: asActionId('coupNvaRedeployTroops'),
      params: {
        sourceSpace: 'quang-tri-thua-thien:none',
        targetSpace: 'central-laos:none',
      },
    }).state;

    assert.equal(countPieces(moved, 'central-laos:none', 'NVA', 'troops'), 1);

    assert.throws(() => applyMove(def, state, {
      actionId: asActionId('coupNvaRedeployTroops'),
      params: {
        sourceSpace: 'quang-tri-thua-thien:none',
        targetSpace: 'saigon:none',
      },
    }));

    const guerrillaOnly = withCoupPhase(base, {
      phase: asPhaseId('coupRedeploy'),
      activePlayer: 2 as GameState['activePlayer'],
      zones: {
        'da-nang:none': [piece('nva-g-2', 'NVA', 'guerrilla')],
        'central-laos:none': [piece('nva-b-2', 'NVA', 'base')],
      },
    });

    assert.throws(() => applyMove(def, guerrillaOnly, {
      actionId: asActionId('coupNvaRedeployTroops'),
      params: {
        sourceSpace: 'da-nang:none',
        targetSpace: 'central-laos:none',
      },
    }));
  });
});
