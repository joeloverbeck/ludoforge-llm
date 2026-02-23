import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asTokenId,
  initialState,
  terminalResult,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const compileProductionDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const withClearedZones = (state: GameState): GameState => ({
  ...state,
  zones: Object.fromEntries(Object.keys(state.zones).map((zoneId) => [zoneId, []])),
});

describe('FITL coup victory phase gating', () => {
  it('halts in coupVictory when a during-coup checkpoint is met', () => {
    const def = compileProductionDef();
    const start = withClearedZones(initialState(def, 8101, 4).state);
    const usReserve = Array.from({ length: 50 }, (_unused, index) => ({
      id: asTokenId(`us-reserve-${index}`),
      type: 'piece' as const,
      props: { faction: 'US', type: 'troops' as const },
    }));
    const state: GameState = {
      ...start,
      currentPhase: asPhaseId('coupVictory'),
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-during'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [{ id: asTokenId('lookahead-event'), type: 'card', props: { isCoup: false } }],
        'deck:none': [{ id: asTokenId('deck-event'), type: 'card', props: { isCoup: false } }],
        'available-US:none': usReserve,
      },
    };

    const applied = applyMove(def, state, { actionId: asActionId('coupVictoryCheck'), params: {} });

    assert.equal(applied.state.currentPhase, asPhaseId('coupVictory'));
    assert.equal(applied.state.turnCount, state.turnCount);
    assert.deepEqual(terminalResult(def, applied.state), {
      type: 'win',
      player: 0,
      victory: {
        timing: 'duringCoup',
        checkpointId: 'us-victory',
        winnerSeat: '0',
      },
    });
  });

  it('advances from coupVictory to coupResources when no checkpoint is met', () => {
    const def = compileProductionDef();
    const start = withClearedZones(initialState(def, 8102, 4).state);
    const state: GameState = {
      ...start,
      currentPhase: asPhaseId('coupVictory'),
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-no-win'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [{ id: asTokenId('lookahead-event'), type: 'card', props: { isCoup: false } }],
        'deck:none': [{ id: asTokenId('deck-event'), type: 'card', props: { isCoup: false } }],
      },
    };

    const applied = applyMove(def, state, { actionId: asActionId('coupVictoryCheck'), params: {} });

    assert.equal(terminalResult(def, applied.state), null);
    assert.equal(applied.state.currentPhase, asPhaseId('coupResources'));
    assert.equal(applied.state.turnCount, state.turnCount);
  });

  it('resolves final-coup ranking after coupRedeploy on the last coup round', () => {
    const def = compileProductionDef();
    const start = withClearedZones(initialState(def, 8103, 4).state);
    const state: GameState = {
      ...start,
      currentPhase: asPhaseId('coupRedeploy'),
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-final'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [],
        'deck:none': [],
      },
    };

    const applied = applyMove(def, state, { actionId: asActionId('coupRedeployPass'), params: {} });

    assert.equal(applied.state.currentPhase, asPhaseId('coupRedeploy'));
    assert.equal(applied.state.turnCount, state.turnCount);
    assert.deepEqual(terminalResult(def, applied.state), {
      type: 'win',
      player: 2,
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-coup-ranking',
        winnerSeat: '2',
        ranking: [
          { seat: '2', margin: 0, rank: 1, tieBreakKey: '2' },
          { seat: '3', margin: 0, rank: 2, tieBreakKey: '3' },
          { seat: '1', margin: 0, rank: 3, tieBreakKey: '1' },
          { seat: '0', margin: 0, rank: 4, tieBreakKey: '0' },
        ],
      },
    });
  });
});
