import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  asPhaseId,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
  type TriggerLogEntry,
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

const piece = (id: string, faction: string, pieceType: string, activity?: 'active' | 'underground'): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: {
    faction,
    type: pieceType,
    ...(activity === undefined ? {} : { activity }),
  },
});

const card = (id: string, isCoup: boolean): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { isCoup },
});

const MOMENTUM_VARS = [
  'mom_wildWeasels',
  'mom_adsid',
  'mom_rollingThunder',
  'mom_medevacUnshaded',
  'mom_medevacShaded',
  'mom_blowtorchKomer',
  'mom_claymores',
  'mom_daNang',
  'mom_mcnamaraLine',
  'mom_oriskany',
  'mom_bombingPause',
  'mom_559thTransportGrp',
  'mom_bodyCount',
  'mom_generalLansdale',
  'mom_typhoonKate',
] as const;

const setupResetEntryState = (def: GameDef, trail: number): GameState => {
  const base = withClearedZones(initialState(def, 9701, 4).state);

  const globalVars: Record<string, number | boolean> = {
    ...base.globalVars,
    trail,
    terrorSabotageMarkersPlaced: 15,
  };

  for (const varName of MOMENTUM_VARS) {
    globalVars[varName] = true;
  }

  return {
    ...base,
    currentPhase: asPhaseId('coupCommitment'),
    activePlayer: asPlayerId(1),
    globalVars: globalVars as GameState['globalVars'],
    zones: {
      ...base.zones,
      'played:none': [card('played-coup', true)],
      'lookahead:none': [card('lookahead-event', false)],
      'deck:none': [card('deck-event', false)],
      'loc-hue-khe-sanh:none': [piece('nva-g-1', 'NVA', 'guerrilla', 'active')],
      'loc-hue-da-nang:none': [piece('vc-g-1', 'VC', 'guerrilla', 'active')],
      'da-nang:none': [
        piece('us-i-1', 'US', 'irregular', 'active'),
        piece('arvn-r-1', 'ARVN', 'ranger', 'active'),
      ],
    },
    markers: {
      ...base.markers,
      'loc-hue-khe-sanh:none': {
        ...(base.markers['loc-hue-khe-sanh:none'] ?? {}),
        sabotage: 'sabotage',
      },
      'loc-hue-da-nang:none': {
        ...(base.markers['loc-hue-da-nang:none'] ?? {}),
        sabotage: 'sabotage',
      },
    },
    zoneVars: {
      ...base.zoneVars,
      'loc-hue-khe-sanh:none': {
        ...(base.zoneVars['loc-hue-khe-sanh:none'] ?? {}),
        terrorCount: 1,
      },
      'loc-hue-da-nang:none': {
        ...(base.zoneVars['loc-hue-da-nang:none'] ?? {}),
        terrorCount: 1,
      },
    },
  };
};

describe('FITL coup reset phase (production data)', () => {
  it('runs Rule 6.6 automatically on coupReset phase entry and uses lifecycle for next card', () => {
    const def = compileProductionDef();
    const start = setupResetEntryState(def, 4);

    const resetEntryLog: TriggerLogEntry[] = [];
    const atReset = advancePhase(def, start, resetEntryLog);

    assert.equal(atReset.currentPhase, asPhaseId('coupReset'));
    assert.equal(atReset.globalVars.trail, 3);
    assert.equal(atReset.globalVars.terrorSabotageMarkersPlaced, 0);
    assert.equal(atReset.zoneVars['loc-hue-khe-sanh:none']?.terrorCount ?? 0, 0);
    assert.equal(atReset.markers['loc-hue-khe-sanh:none']?.sabotage, 'none');
    assert.equal(atReset.zoneVars['loc-hue-da-nang:none']?.terrorCount ?? 0, 0);
    assert.equal(atReset.markers['loc-hue-da-nang:none']?.sabotage, 'none');

    for (const zoneId of ['loc-hue-khe-sanh:none', 'loc-hue-da-nang:none', 'da-nang:none']) {
      for (const token of atReset.zones[zoneId] ?? []) {
        if (token.type !== 'piece') {
          continue;
        }
        if (
          (token.props.faction === 'NVA' || token.props.faction === 'VC') &&
          token.props.type === 'guerrilla'
        ) {
          assert.equal(token.props.activity, 'underground');
        }
        if (
          (token.props.faction === 'US' && token.props.type === 'irregular') ||
          (token.props.faction === 'ARVN' && token.props.type === 'ranger')
        ) {
          assert.equal(token.props.activity, 'underground');
        }
      }
    }

    for (const varName of MOMENTUM_VARS) {
      assert.equal(atReset.globalVars[varName], false, `${varName} must reset to false`);
    }

    const resetMoves = legalMoves(def, atReset);
    assert.equal(resetMoves.length, 0, 'coupReset must be fully automatic and expose no moves');

    const beforeBoundaryPlayed = atReset.zones['played:none']?.[0]?.id;
    const beforeBoundaryLookahead = atReset.zones['lookahead:none']?.[0]?.id;
    const beforeBoundaryDeckTop = atReset.zones['deck:none']?.[0]?.id;

    const lifecycleLog: TriggerLogEntry[] = [];
    const nextTurn = advancePhase(def, atReset, lifecycleLog);

    assert.equal(nextTurn.currentPhase, asPhaseId('main'));
    assert.equal(nextTurn.turnCount, atReset.turnCount + 1);
    assert.equal(nextTurn.zones['played:none']?.[0]?.id, beforeBoundaryLookahead);
    assert.equal(nextTurn.zones['lookahead:none']?.[0]?.id, beforeBoundaryDeckTop);
    assert.equal(nextTurn.zones['leader:none']?.[0]?.id, beforeBoundaryPlayed);

    const lifecycleSteps = lifecycleLog
      .filter((entry) => entry.kind === 'turnFlowLifecycle')
      .map((entry) => entry.step);
    assert.deepEqual(lifecycleSteps, ['coupToLeader', 'coupHandoff', 'promoteLookaheadToPlayed', 'revealLookahead']);
  });

  it('normalizes trail from 0 to 1 at reset entry', () => {
    const def = compileProductionDef();
    const start = setupResetEntryState(def, 0);
    const atReset = advancePhase(def, start);

    assert.equal(atReset.currentPhase, asPhaseId('coupReset'));
    assert.equal(atReset.globalVars.trail, 1);
  });

  it('leaves trail unchanged when already in 1..3', () => {
    const def = compileProductionDef();
    const start = setupResetEntryState(def, 2);
    const atReset = advancePhase(def, start);

    assert.equal(atReset.currentPhase, asPhaseId('coupReset'));
    assert.equal(atReset.globalVars.trail, 2);
  });
});
