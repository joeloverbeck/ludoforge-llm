// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  enumerateLegalMoves,
  legalMoves,
  type ActionDef,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';

/**
 * Integration test verifying that plain (non-pipeline) actions with
 * unsatisfiable decision sequences are filtered from legalMoves.
 *
 * Uses a minimal inline GameDef (not the full FITL production spec)
 * because all FITL operations are pipeline-backed. This test validates
 * the engine-level behavior that would apply to any game's plain actions.
 */

const makeMinimalDef = (actions: readonly ActionDef[]): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'feasibility-probe-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [{ id: 'piece', props: { faction: 'string' } }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions,
    triggers: [],
    terminal: { conditions: [] },
  });

const makeMinimalState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

describe('plain-action feasibility probe integration', () => {
  it('filters an action whose chooseOne has an empty domain', () => {
    const action: ActionDef = {
      id: asActionId('selectTarget'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: [] },
          },
        }) as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeMinimalDef([action]);
    const state = makeMinimalState();

    const moves = legalMoves(def, state, { probePlainActionFeasibility: true });
    assert.equal(moves.length, 0, 'action with empty choice domain should be excluded');
  });

  it('includes an action whose chooseOne has a non-empty domain', () => {
    const action: ActionDef = {
      id: asActionId('selectTarget'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: ['alpha', 'bravo'] },
          },
        }) as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeMinimalDef([action]);
    const state = makeMinimalState();

    const moves = legalMoves(def, state, { probePlainActionFeasibility: true });
    assert.equal(moves.length, 1, 'action with satisfiable choice domain should be included');
    assert.equal(moves[0]?.actionId, asActionId('selectTarget'));
  });

  it('conservatively keeps moves when probe budget is exhausted', () => {
    const action: ActionDef = {
      id: asActionId('deepChoice'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$a',
            bind: '$a',
            options: { query: 'enums', values: ['x'] },
          },
        }) as GameDef['actions'][number]['effects'][number],
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$b',
            bind: '$b',
            options: { query: 'enums', values: ['y'] },
          },
        }) as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeMinimalDef([action]);
    const state = makeMinimalState();

    const result = enumerateLegalMoves(def, state, { probePlainActionFeasibility: true, budgets: { maxDecisionProbeSteps: 0 } });
    assert.equal(result.moves.length, 1, 'move should be kept when budget forces unknown classification');
  });
});
