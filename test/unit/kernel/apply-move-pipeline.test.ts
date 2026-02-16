import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveActionPipelineDispatch } from '../../../src/kernel/apply-move-pipeline.js';
import { createCollector } from '../../../src/kernel/execution-collector.js';
import { buildAdjacencyGraph } from '../../../src/kernel/spatial.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import type { EvalContext } from '../../../src/kernel/eval-context.js';

const makeDef = (overrides?: {
  readonly actionPipelines?: readonly ActionPipelineDef[];
  readonly actions?: readonly ActionDef[];
}): GameDef => ({
  metadata: { id: 'resolve-action-pipeline-test', players: { min: 2, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: overrides?.actions ?? [{
    id: asActionId('attack'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  }],
  ...(overrides?.actionPipelines === undefined ? {} : { actionPipelines: overrides.actionPipelines }),
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (activePlayer: number): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 4,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(activePlayer),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (def: GameDef, state: GameState): EvalContext => ({
  def,
  adjacencyGraph: buildAdjacencyGraph(def.zones),
  state,
  activePlayer: state.activePlayer,
  actorPlayer: state.activePlayer,
  bindings: {},
  collector: createCollector(),
});

describe('resolveActionPipelineDispatch()', () => {
  it('returns matched when a single profile without applicability exists', () => {
    const def = makeDef({
      actionPipelines: [{
        id: 'attack-profile',
        actionId: asActionId('attack'),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [],
        atomicity: 'atomic',
      }],
    });
    const action = def.actions[0]!;

    const result = resolveActionPipelineDispatch(def, action, makeCtx(def, makeState(0)));
    assert.equal(result.kind, 'matched');
    if (result.kind === 'matched') {
      assert.equal(result.profile.id, 'attack-profile');
    }
  });

  it('returns configuredNoMatch when a single profile applicability evaluates false', () => {
    const def = makeDef({
      actionPipelines: [{
        id: 'attack-nva-profile',
        actionId: asActionId('attack'),
        applicability: { op: '==', left: { ref: 'activePlayer' }, right: '2' },
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [],
        atomicity: 'atomic',
      }],
    });
    const action = def.actions[0]!;

    const result = resolveActionPipelineDispatch(def, action, makeCtx(def, makeState(0)));
    assert.equal(result.kind, 'configuredNoMatch');
  });

  it('throws contextual error when applicability evaluation fails', () => {
    const def = makeDef({
      actionPipelines: [{
        id: 'attack-broken-profile',
        actionId: asActionId('attack'),
        applicability: { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [],
        atomicity: 'atomic',
      }],
    });
    const action = def.actions[0]!;

    assert.throws(
      () => resolveActionPipelineDispatch(def, action, makeCtx(def, makeState(0))),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /action pipeline applicability evaluation failed/);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED');
        assert.equal(details.context?.actionId, asActionId('attack'));
        assert.equal(details.context?.profileId, 'attack-broken-profile');
        assert.equal(details.context?.reason, 'applicabilityEvaluationFailed');
        return true;
      },
    );
  });

  it('selects the matching profile when multiple candidates exist', () => {
    const def = makeDef({
      actionPipelines: [
        {
          id: 'attack-nva-profile',
          actionId: asActionId('attack'),
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: '2' },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
        {
          id: 'attack-vc-profile',
          actionId: asActionId('attack'),
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: '3' },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    });
    const action = def.actions[0]!;

    const result = resolveActionPipelineDispatch(def, action, makeCtx(def, makeState(3)));
    assert.equal(result.kind, 'matched');
    if (result.kind === 'matched') {
      assert.equal(result.profile.id, 'attack-vc-profile');
    }
  });

  it('returns noneConfigured when no pipelines exist for action', () => {
    const def = makeDef();
    const action = def.actions[0]!;

    const result = resolveActionPipelineDispatch(def, action, makeCtx(def, makeState(0)));
    assert.equal(result.kind, 'noneConfigured');
  });
});
