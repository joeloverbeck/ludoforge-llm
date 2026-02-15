import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  legalMoves,
  legalChoices,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

/**
 * Shared helpers for multi-pipeline dispatch tests.
 *
 * Two action pipelines share actionId 'operate':
 *   - profile-player-0: applicability = { activePlayer == '0' }, sets score += 10
 *   - profile-player-1: applicability = { activePlayer == '1' }, sets score += 20
 */

const createMultiProfileDef = (): GameDef =>
  ({
    metadata: { id: 'applicability-dispatch', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
    ],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actionPipelines: [
      {
        id: 'profile-player-0',
        actionId: asActionId('operate'),
        applicability: { op: '==', left: { ref: 'activePlayer' }, right: '0' },
        legality: null,
        costValidation: null, costEffects: [],
        targeting: {},
        stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 10 } }] }],
        atomicity: 'atomic',
      },
      {
        id: 'profile-player-1',
        actionId: asActionId('operate'),
        applicability: { op: '==', left: { ref: 'activePlayer' }, right: '1' },
        legality: null,
        costValidation: null, costEffects: [],
        targeting: {},
        stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 20 } }] }],
        atomicity: 'atomic',
      },
    ],
    actions: [
      {
        id: asActionId('operate'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 99 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const createState = (activePlayer: number): GameState => {
  const def = createMultiProfileDef();
  const base = initialState(def, 42);
  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    currentPhase: asPhaseId('main'),
  };
};

describe('applicability-based action pipeline dispatch', () => {
  it('legalMoves includes the action when the matching profile is applicable', () => {
    const def = createMultiProfileDef();
    const stateP0 = createState(0);
    const movesP0 = legalMoves(def, stateP0);
    assert.ok(movesP0.some((m) => m.actionId === asActionId('operate')));

    const stateP1 = createState(1);
    const movesP1 = legalMoves(def, stateP1);
    assert.ok(movesP1.some((m) => m.actionId === asActionId('operate')));
  });

  it('legalChoices returns complete for an applicable profile with no choices', () => {
    const def = createMultiProfileDef();
    const state = createState(0);
    const result = legalChoices(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.complete, true);
  });

  it('applyMove applies player-0 profile effects when activePlayer is 0', () => {
    const def = createMultiProfileDef();
    const state = createState(0);
    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.state.globalVars.score, 10);
  });

  it('applyMove applies player-1 profile effects when activePlayer is 1', () => {
    const def = createMultiProfileDef();
    const state = createState(1);
    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.state.globalVars.score, 20);
  });

  it('does not use fallback action effects when a profile matches', () => {
    const def = createMultiProfileDef();
    const state = createState(0);
    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    // If fallback effects were used, score would be 99
    assert.notEqual(result.state.globalVars.score, 99);
    assert.equal(result.state.globalVars.score, 10);
  });

  it('single pipeline without applicability still works', () => {
    const def: GameDef = {
      ...createMultiProfileDef(),
      actionPipelines: [
        {
          id: 'solo-profile',
          actionId: asActionId('operate'),
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 5 } }] }],
          atomicity: 'atomic',
        },
      ],
    } as unknown as GameDef;
    const state = createState(0);
    const result = applyMove(def, state, { actionId: asActionId('operate'), params: {} });
    assert.equal(result.state.globalVars.score, 5);
  });

  it('treats action as illegal when no candidate applicability matches', () => {
    const def: GameDef = {
      ...createMultiProfileDef(),
      actionPipelines: [
        {
          id: 'profile-player-0',
          actionId: asActionId('operate'),
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: '0' },
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 10 } }] }],
          atomicity: 'atomic',
        },
        {
          id: 'profile-player-1',
          actionId: asActionId('operate'),
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: '1' },
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 20 } }] }],
          atomicity: 'atomic',
        },
      ],
    } as unknown as GameDef;
    // Player 999 matches no applicability.
    const state: GameState = { ...createState(0), activePlayer: asPlayerId(999) };
    const legal = legalMoves(def, state);
    assert.ok(!legal.some((move) => move.actionId === asActionId('operate')));

    const choices = legalChoices(def, state, { actionId: asActionId('operate'), params: {} });
    assert.deepStrictEqual(choices, { kind: 'illegal', complete: false, reason: 'pipelineNotApplicable' });

    assert.throws(() => applyMove(def, state, { actionId: asActionId('operate'), params: {} }), /Illegal move/);
  });

  it('treats action as illegal when single candidate applicability is false', () => {
    const def: GameDef = {
      ...createMultiProfileDef(),
      actionPipelines: [
        {
          id: 'single-false-applicability',
          actionId: asActionId('operate'),
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: '999' },
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 33 } }] }],
          atomicity: 'atomic',
        },
      ],
    } as unknown as GameDef;

    const state = createState(0);
    const legal = legalMoves(def, state);
    assert.ok(!legal.some((move) => move.actionId === asActionId('operate')));
    assert.throws(() => applyMove(def, state, { actionId: asActionId('operate'), params: {} }), /Illegal move/);
  });

  it('surfaces malformed applicability errors in legalMoves, legalChoices, and applyMove', () => {
    const def: GameDef = {
      ...createMultiProfileDef(),
      actionPipelines: [
        {
          id: 'broken-applicability',
          actionId: asActionId('operate'),
          applicability: { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 10 } }] }],
          atomicity: 'atomic',
        },
      ],
    } as unknown as GameDef;
    const state = createState(0);

    for (const run of [
      () => legalMoves(def, state),
      () => legalChoices(def, state, { actionId: asActionId('operate'), params: {} }),
      () => applyMove(def, state, { actionId: asActionId('operate'), params: {} }),
    ]) {
      assert.throws(run, (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /action pipeline applicability evaluation failed/);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED');
        assert.equal(details.context?.actionId, asActionId('operate'));
        assert.equal(details.context?.profileId, 'broken-applicability');
        assert.equal(details.context?.reason, 'applicabilityEvaluationFailed');
        return true;
      });
    }
  });

  it('profile with legality condition blocks move for the matching applicability player', () => {
    const def: GameDef = {
      ...createMultiProfileDef(),
      actionPipelines: [
        {
          id: 'profile-player-0',
          actionId: asActionId('operate'),
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: '0' },
          legality: { op: '>=', left: { ref: 'gvar', var: 'score' }, right: 50 },
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 10 } }] }],
          atomicity: 'atomic',
        },
        {
          id: 'profile-player-1',
          actionId: asActionId('operate'),
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: '1' },
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [{ addVar: { scope: 'global', var: 'score', delta: 20 } }] }],
          atomicity: 'atomic',
        },
      ],
    } as unknown as GameDef;

    // Player 0: score is 0, legality requires >= 50 — move is NOT legal
    const stateP0 = createState(0);
    const movesP0 = legalMoves(def, stateP0);
    assert.ok(!movesP0.some((m) => m.actionId === asActionId('operate')));

    // Player 1: no legality condition — move IS legal
    const stateP1 = createState(1);
    const movesP1 = legalMoves(def, stateP1);
    assert.ok(movesP1.some((m) => m.actionId === asActionId('operate')));
  });
});
