// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyPreviewMove, createPolicyPreviewRuntime } from '../../../src/agents/policy-preview.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  createTrustedExecutableMove,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type TrustedExecutableMove,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

const createDecisionDrivenDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-preview-driver', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [
    {
      id: asActionId('branch'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ] satisfies ActionDef[],
  actionPipelines: [{
    id: 'branch-profile',
    actionId: asActionId('branch'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$pick',
            bind: '$pick',
            options: { query: 'enums', values: ['left', 'right'] },
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
        eff({ addVar: { scope: 'global', var: 'score', delta: 3 } }),
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
});

const createChooseNDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-preview-driver-choose-n', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [
    {
      id: asActionId('select'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ] satisfies ActionDef[],
  actionPipelines: [{
    id: 'select-profile',
    actionId: asActionId('select'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$targets',
            bind: '$targets',
            options: { query: 'enums', values: ['A', 'B'] },
            n: 2,
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
        eff({ addVar: { scope: 'global', var: 'score', delta: 5 } }),
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
});

const createOtherSeatDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-preview-driver-seat-fence', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [
    {
      id: asActionId('ask-other'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ] satisfies ActionDef[],
  actionPipelines: [{
    id: 'ask-other-profile',
    actionId: asActionId('ask-other'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$pick',
            bind: '$pick',
            chooser: { id: asPlayerId(1) },
            options: { query: 'enums', values: ['left', 'right'] },
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
        eff({ addVar: { scope: 'global', var: 'score', delta: 7 } }),
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
});

const createStochasticDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-preview-driver-stochastic', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [
    {
      id: asActionId('roll'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ] satisfies ActionDef[],
  actionPipelines: [{
    id: 'roll-profile',
    actionId: asActionId('roll'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({
          rollRandom: {
            bind: '$die',
            min: 1,
            max: 6,
            in: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
});

function createRuntime(def: GameDef, state: GameState, trustedMove: TrustedExecutableMove, overrides?: {
  readonly completionDepthCap?: number;
  readonly previewMode?: 'exactWorld' | 'tolerateStochastic';
  readonly applyMove?: typeof applyPreviewMove;
}) {
  return createPolicyPreviewRuntime({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: '0',
    trustedMoveIndex: new Map([['candidate', trustedMove]]),
    previewMode: overrides?.previewMode ?? 'exactWorld',
    completionPolicy: 'greedy',
    ...(overrides?.completionDepthCap === undefined ? {} : { completionDepthCap: overrides.completionDepthCap }),
    ...(overrides?.applyMove === undefined ? {} : { dependencies: { applyMove: overrides.applyMove } }),
  });
}

function trustedCandidate(def: GameDef, actionId: string): {
  readonly state: GameState;
  readonly trustedMove: TrustedExecutableMove;
} {
  const state = initialState(def, 145, 2).state;
  const move = { actionId: asActionId(actionId), params: {} };
  return {
    state,
    trustedMove: createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
  };
}

describe('policy preview synthetic-completion driver', () => {
  it('returns depthCap when the configured cap is exhausted before the inner decision resolves', () => {
    const def = createDecisionDrivenDef();
    const { state, trustedMove } = trustedCandidate(def, 'branch');
    const runtime = createRuntime(def, state, trustedMove, { completionDepthCap: 1 });

    assert.equal(runtime.getOutcome({ move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'branch' }), 'depthCap');
  });

  it('drives bounded chooseOne and chooseN completions to preview-ready states', () => {
    const branchDef = createDecisionDrivenDef();
    const branch = trustedCandidate(branchDef, 'branch');
    const branchRuntime = createRuntime(branchDef, branch.state, branch.trustedMove, { completionDepthCap: 8 });
    assert.equal(branchRuntime.getPreviewState({ move: branch.trustedMove.move, stableMoveKey: 'candidate', actionId: 'branch' })?.globalVars.score, 3);

    const chooseNDef = createChooseNDef();
    const chooseN = trustedCandidate(chooseNDef, 'select');
    const chooseNRuntime = createRuntime(chooseNDef, chooseN.state, chooseN.trustedMove, { completionDepthCap: 8 });
    assert.equal(chooseNRuntime.getPreviewState({ move: chooseN.trustedMove.move, stableMoveKey: 'candidate', actionId: 'select' })?.globalVars.score, 5);
  });

  it('stops at another-seat inner decisions without selecting them', () => {
    const def = createOtherSeatDef();
    const { state, trustedMove } = trustedCandidate(def, 'ask-other');
    const runtime = createRuntime(def, state, trustedMove, { completionDepthCap: 8 });

    const preview = runtime.getPreviewState({ move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'ask-other' });
    assert.equal(preview?.globalVars.score, 0);
  });

  it('surfaces stochastic inner microturns without sampling chance', () => {
    const def = createStochasticDef();
    const { state, trustedMove } = trustedCandidate(def, 'roll');
    const runtime = createRuntime(def, state, trustedMove, { completionDepthCap: 8, previewMode: 'tolerateStochastic' });

    assert.equal(runtime.getOutcome({ move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'roll' }), 'stochastic');
  });

  it('caches deterministic outcomes and does not mutate the input state', () => {
    const def = createDecisionDrivenDef();
    const { state, trustedMove } = trustedCandidate(def, 'branch');
    const preDriveStateHash = state.stateHash;
    let applyCount = 0;
    const runtime = createRuntime(def, state, trustedMove, {
      completionDepthCap: 8,
      applyMove(targetDef, baseState, move, options, targetRuntime) {
        applyCount += 1;
        return applyPreviewMove(targetDef, baseState, move, options, targetRuntime);
      },
    });
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'branch' };

    assert.equal(runtime.getOutcome(candidate), 'ready');
    assert.equal(runtime.getOutcome(candidate), 'ready');
    assert.equal(applyCount, 1);
    assert.equal(state.stateHash, preDriveStateHash);
  });
});
