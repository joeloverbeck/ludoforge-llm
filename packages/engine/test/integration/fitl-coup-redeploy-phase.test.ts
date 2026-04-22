// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  createEvalRuntimeResources,
  initialState,
  applyMove,
  asActionId,
  asPhaseId,
  asTokenId,
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
  props: {
    faction,
    type: pieceType,
    ...((faction === 'US' || faction === 'ARVN') && (pieceType === 'troops' || pieceType === 'police')
      ? { m48PatrolMoved: false }
      : {}),
    ...((faction === 'ARVN' || faction === 'NVA') && (pieceType === 'troops' || pieceType === 'police')
      ? { coupRedeployed: false }
      : {}),
  },
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

/**
 * Find the first pending completion decision key for a move.
 * The action has sourceSpace as a param; the target destination is a chooseOne completion.
 */
const findDestinationKey = (def: GameDef, state: GameState, actionId: string, sourceSpace: string): string => {
  try {
    applyMove(def, state, { actionId: asActionId(actionId), params: { sourceSpace } });
    return '';
  } catch (e: unknown) {
    return (e as { context?: { nextDecisionKey?: string } }).context?.nextDecisionKey ?? '';
  }
};

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

    const entered = advancePhase({ def, state, evalRuntimeResources: createEvalRuntimeResources() });

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

  it('enforces ARVN mandatory troop redeploy before optional and batch-moves all troops from source', () => {
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

    // Optional from saigon should throw while mandatory zones exist
    assert.throws(() => applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployOptionalTroops'),
      params: { sourceSpace: 'saigon:none' },
    }));

    // Mandatory from LoC should work — find the destination decision key
    const destKey = findDestinationKey(def, state, 'coupArvnRedeployMandatory', 'loc-hue-da-nang:none');
    assert.ok(destKey, 'mandatory action should have a pending $destination decision');

    // Move troop from LoC to Saigon (valid destination)
    const afterMandatory = applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployMandatory'),
      params: { sourceSpace: 'loc-hue-da-nang:none', [destKey]: 'saigon:none' },
    }).state;

    assert.equal(countPieces(afterMandatory, 'loc-hue-da-nang:none', 'ARVN', 'troops'), 0);
    assert.equal(countPieces(afterMandatory, 'saigon:none', 'ARVN', 'troops'), 2);
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

    // Police redeploy to valid LoC destination
    const destKey = findDestinationKey(def, state, 'coupArvnRedeployPolice', 'quang-nam:none');
    assert.ok(destKey, 'police action should have a pending $destination decision');

    const movedToLoc = applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployPolice'),
      params: { sourceSpace: 'quang-nam:none', [destKey]: 'loc-hue-da-nang:none' },
    }).state;

    assert.equal(countPieces(movedToLoc, 'loc-hue-da-nang:none', 'ARVN', 'police'), 1);

    // Invalid destination (outside South Vietnam) should throw
    assert.throws(() => applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployPolice'),
      params: { sourceSpace: 'quang-nam:none', [destKey]: 'central-laos:none' },
    }));
  });

  it('does not allow redeployed ARVN police to redeploy again in the same coup phase', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 88031, 4).state);
    const state = withCoupPhase(base, {
      phase: asPhaseId('coupRedeploy'),
      activePlayer: 1 as GameState['activePlayer'],
      zones: {
        'quang-nam:none': [piece('arvn-police-1', 'ARVN', 'police')],
      },
    });

    const destKey = findDestinationKey(def, state, 'coupArvnRedeployPolice', 'quang-nam:none');
    const moved = applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployPolice'),
      params: { sourceSpace: 'quang-nam:none', [destKey]: 'loc-hue-da-nang:none' },
    }).state;

    assert.throws(() => applyMove(def, moved, {
      actionId: asActionId('coupArvnRedeployPolice'),
      params: { sourceSpace: 'loc-hue-da-nang:none' },
    }));
  });

  it('does not allow mandatory-redeployed ARVN troops to redeploy again as optional troops in the same coup phase', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 88032, 4).state);
    const state = withCoupPhase(base, {
      phase: asPhaseId('coupRedeploy'),
      activePlayer: 1 as GameState['activePlayer'],
      zones: {
        'loc-hue-da-nang:none': [piece('arvn-mandatory', 'ARVN', 'troops')],
      },
    });

    const destKey = findDestinationKey(def, state, 'coupArvnRedeployMandatory', 'loc-hue-da-nang:none');
    const moved = applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployMandatory'),
      params: { sourceSpace: 'loc-hue-da-nang:none', [destKey]: 'saigon:none' },
    }).state;

    assert.throws(() => applyMove(def, moved, {
      actionId: asActionId('coupArvnRedeployOptionalTroops'),
      params: { sourceSpace: 'saigon:none' },
    }));
  });

  it('does not allow optionally redeployed ARVN troops to redeploy again in the same coup phase', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 88033, 4).state);
    const state = withCoupPhase(base, {
      phase: asPhaseId('coupRedeploy'),
      activePlayer: 1 as GameState['activePlayer'],
      zones: {
        'saigon:none': [piece('arvn-optional', 'ARVN', 'troops')],
      },
    });

    const destKey = findDestinationKey(def, state, 'coupArvnRedeployOptionalTroops', 'saigon:none');
    assert.ok(destKey, 'optional troop redeploy should have a pending $destination decision');

    const moved = applyMove(def, state, {
      actionId: asActionId('coupArvnRedeployOptionalTroops'),
      params: { sourceSpace: 'saigon:none', [destKey]: 'saigon:none' },
    }).state;

    assert.throws(() => applyMove(def, moved, {
      actionId: asActionId('coupArvnRedeployOptionalTroops'),
      params: { sourceSpace: 'quang-nam:none' },
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

    // NVA redeploy to valid destination (space with NVA base)
    const destKey = findDestinationKey(def, state, 'coupNvaRedeployTroops', 'quang-tri-thua-thien:none');
    assert.ok(destKey, 'NVA action should have a pending $destination decision');

    const moved = applyMove(def, state, {
      actionId: asActionId('coupNvaRedeployTroops'),
      params: { sourceSpace: 'quang-tri-thua-thien:none', [destKey]: 'central-laos:none' },
    }).state;

    // Only troops move (batch moves ALL NVA troops from source), guerrillas stay
    assert.equal(countPieces(moved, 'central-laos:none', 'NVA', 'troops'), 1);
    assert.equal(countPieces(moved, 'quang-tri-thua-thien:none', 'NVA', 'guerrilla'), 1);

    // Invalid destination (no NVA base) should throw
    assert.throws(() => applyMove(def, state, {
      actionId: asActionId('coupNvaRedeployTroops'),
      params: { sourceSpace: 'quang-tri-thua-thien:none', [destKey]: 'saigon:none' },
    }));

    // State with only guerrillas (no troops) — NVA redeploy should fail
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
      params: { sourceSpace: 'da-nang:none' },
    }));
  });

  it('does not allow redeployed NVA troops to redeploy again in the same coup phase', () => {
    const def = compileProductionDef();
    const base = withClearedZones(initialState(def, 88041, 4).state);
    const state = withCoupPhase(base, {
      phase: asPhaseId('coupRedeploy'),
      activePlayer: 2 as GameState['activePlayer'],
      zones: {
        'quang-tri-thua-thien:none': [piece('nva-t-1', 'NVA', 'troops')],
        'central-laos:none': [piece('nva-b-1', 'NVA', 'base')],
      },
    });

    const destKey = findDestinationKey(def, state, 'coupNvaRedeployTroops', 'quang-tri-thua-thien:none');
    const moved = applyMove(def, state, {
      actionId: asActionId('coupNvaRedeployTroops'),
      params: { sourceSpace: 'quang-tri-thua-thien:none', [destKey]: 'central-laos:none' },
    }).state;

    assert.throws(() => applyMove(def, moved, {
      actionId: asActionId('coupNvaRedeployTroops'),
      params: { sourceSpace: 'central-laos:none' },
    }));
  });
});
