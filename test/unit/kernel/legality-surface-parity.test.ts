import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalChoices,
  legalMoves,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const makeState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: { resources: 0 },
  perPlayerVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

const makeAction = (overrides?: Partial<ActionDef>): ActionDef => ({
  id: asActionId('op'),
  actor: 'active',
  executor: 'actor',
  phase: asPhaseId('main'),
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
  ...overrides,
});

const makeDef = (overrides?: {
  readonly action?: ActionDef;
  readonly actionPipelines?: readonly ActionPipelineDef[];
}): GameDef =>
  ({
    metadata: { id: 'legality-surface-parity', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('other') }] },
    actions: [overrides?.action ?? makeAction()],
    ...(overrides?.actionPipelines === undefined ? {} : { actionPipelines: overrides.actionPipelines }),
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

describe('legality surface parity', () => {
  it('phase mismatch maps consistently across legalChoices, applyMove, and legalMoves', () => {
    const def = makeDef({ action: makeAction({ phase: asPhaseId('other') }) });
    const state = makeState({ currentPhase: asPhaseId('main') });
    const move = { actionId: asActionId('op'), params: {} };

    assert.deepEqual(legalChoices(def, state, move), { kind: 'illegal', complete: false, reason: 'phaseMismatch' });
    assert.equal(legalMoves(def, state).length, 0);
    assert.throws(() => applyMove(def, state, move), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
      assert.equal(details.code, 'ILLEGAL_MOVE');
      const metadata = details.context?.metadata as Record<string, unknown> | undefined;
      assert.equal(metadata?.code, 'ACTION_PHASE_MISMATCH');
      return true;
    });
  });

  it('action limit exceeded maps consistently across legalChoices, applyMove, and legalMoves', () => {
    const def = makeDef({
      action: makeAction({
        id: asActionId('limitedOp'),
        limits: [{ scope: 'phase', max: 1 }],
      }),
    });
    const state = makeState({
      actionUsage: { limitedOp: { turnCount: 0, phaseCount: 1, gameCount: 0 } },
    });
    const move = { actionId: asActionId('limitedOp'), params: {} };

    assert.deepEqual(legalChoices(def, state, move), { kind: 'illegal', complete: false, reason: 'actionLimitExceeded' });
    assert.equal(legalMoves(def, state).length, 0);
    assert.throws(() => applyMove(def, state, move), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
      assert.equal(details.code, 'ILLEGAL_MOVE');
      const metadata = details.context?.metadata as Record<string, unknown> | undefined;
      assert.equal(metadata?.code, 'ACTION_LIMIT_EXCEEDED');
      return true;
    });
  });

  it('pipeline not applicable maps consistently across legalChoices, applyMove, and legalMoves', () => {
    const action = makeAction();
    const def = makeDef({
      action,
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: action.id,
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: '1' },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    });
    const state = makeState({ activePlayer: asPlayerId(0) });
    const move = { actionId: asActionId('op'), params: {} };

    assert.deepEqual(legalChoices(def, state, move), { kind: 'illegal', complete: false, reason: 'pipelineNotApplicable' });
    assert.equal(legalMoves(def, state).length, 0);
    assert.throws(() => applyMove(def, state, move), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
      assert.equal(details.code, 'ILLEGAL_MOVE');
      const metadata = details.context?.metadata as Record<string, unknown> | undefined;
      assert.equal(metadata?.code, 'ACTION_PIPELINE_NOT_APPLICABLE');
      return true;
    });
  });

  it('pipeline legality failed maps consistently across legalChoices, applyMove, and legalMoves', () => {
    const action = makeAction();
    const def = makeDef({
      action,
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: action.id,
          legality: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 5 },
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'partial',
        },
      ],
    });
    const state = makeState({ globalVars: { resources: 0 } });
    const move = { actionId: asActionId('op'), params: {} };

    assert.deepEqual(legalChoices(def, state, move), { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' });
    assert.equal(legalMoves(def, state).length, 0);
    assert.throws(() => applyMove(def, state, move), (error: unknown) => {
      assert.ok(error instanceof Error);
      const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
      assert.equal(details.code, 'ILLEGAL_MOVE');
      const metadata = details.context?.metadata as Record<string, unknown> | undefined;
      assert.equal(metadata?.code, 'OPERATION_LEGALITY_FAILED');
      return true;
    });
  });
});
