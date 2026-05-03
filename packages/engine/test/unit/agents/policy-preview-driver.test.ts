// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyPreviewMove, createPolicyPreviewRuntime } from '../../../src/agents/policy-preview.js';
import { evaluateProductionPreviewDriveBatchWithWasm } from '../../../src/agents/policy-wasm-production-preview-drive.js';
import { loadPolicyWasmRuntime } from '../../../src/agents/policy-wasm-runtime.js';
import { createGameDefRuntime } from '../../../src/kernel/gamedef-runtime.js';
import { computeFullHash, createZobristTable } from '../../../src/kernel/zobrist.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
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

const createInitialApplyDecisionDrivenDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-preview-driver-initial-apply', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'other', type: 'int', init: 9, min: 0, max: 20 },
    { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
  ],
  perPlayerVars: [],
  zones: [{ id: asZoneId('alpha:none'), owner: 'none', visibility: 'public', ordering: 'set', zoneKind: 'board' }, { id: asZoneId('bravo:none'), owner: 'none', visibility: 'public', ordering: 'set', zoneKind: 'board' }],
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
        eff({ addVar: { scope: 'global', var: 'score', delta: 2 } }),
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

const createSetVarDecisionDrivenDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-preview-driver-set-var', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'other', type: 'int', init: 9, min: 0, max: 20 },
    { name: 'score', type: 'int', init: 0, min: 0, max: 20 },
  ],
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
    id: 'set-profile',
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
        eff({ setVar: { scope: 'global', var: 'score', value: 4 } }),
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
});

const createExpressionDecisionDrivenDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-preview-driver-expressions', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'other', type: 'int', init: 9, min: 0, max: 30 },
    { name: 'score', type: 'int', init: 0, min: 0, max: 30 },
  ],
  perPlayerVars: [], zoneVars: [{ name: 'pressure', type: 'int', init: 1, min: 0, max: 2 }],
  zones: [{ id: asZoneId('alpha:none'), owner: 'none', visibility: 'public', ordering: 'set', zoneKind: 'board' }, { id: asZoneId('beta:none'), owner: 'none', visibility: 'public', ordering: 'set', zoneKind: 'board' }],
  tokenTypes: [{ id: 'piece', props: { moved: 'boolean', owner: 'string' } }],
  setup: [eff({ createToken: { type: 'piece', zone: 'alpha:none', props: { owner: 'none' } } })],
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
    id: 'expression-profile',
    actionId: asActionId('branch'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({
          addVar: {
            scope: 'global',
            var: 'score',
            delta: { _t: 6, op: '+', left: { _t: 2, ref: 'gvar', var: 'other' }, right: 1 },
          },
        }),
        eff({
          let: {
            bind: '$bonus',
            value: { _t: 6, op: '-', left: { _t: 2, ref: 'gvar', var: 'score' }, right: 7 },
            in: [
              eff({
                if: {
                  when: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'score' }, right: 10 },
                  then: [eff({ addVar: { scope: 'global', var: 'score', delta: { _t: 2, ref: 'binding', name: '$bonus' } } })],
                  else: [eff({ addVar: { scope: 'global', var: 'score', delta: 99 } })],
                },
              }),
            ],
          },
        }),
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$pick',
            bind: '$pick',
            options: { query: 'enums', values: ['left', 'right'] },
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
        eff({ chooseN: { internalDecisionId: 'decision:$tokens', bind: '$tokens', options: { query: 'tokensInZone', zone: 'alpha:none' }, min: 1, max: 1 } }) as ActionPipelineDef['stages'][number]['effects'][number],
        eff({ forEach: { bind: '$token', over: { query: 'binding', name: '$tokens' }, effects: [eff({ moveToken: { token: '$token', from: 'alpha:none', to: 'beta:none' } }), eff({ setTokenProp: { token: '$token', prop: 'moved', value: true } }), eff({ addVar: { scope: 'global', var: 'score', delta: 2 } })] } }),
        eff({ removeByPriority: { budget: 1, groups: [{ bind: '$removed', over: { query: 'tokensInZone', zone: 'beta:none' }, to: { zoneExpr: { _t: 3, concat: ['alpha:', { _t: 2, ref: 'tokenProp', token: '$removed', prop: 'owner' }] } }, countBind: '$removedCount' }], in: [eff({ addVar: { scope: 'global', var: 'score', delta: { _t: 2, ref: 'binding', name: '$removedCount' } } })] } }), eff({ moveAll: { from: 'alpha:none', to: 'beta:none' } }), eff({ shiftMarker: { space: 'alpha:none', marker: 'mood', delta: 1 } }), eff({ let: { bind: '$zoneVarMutationScope', value: 0, in: [eff({ addVar: { scope: 'zoneVar', zone: 'alpha:none', var: 'pressure', delta: 1 } })] } }),
        eff({ if: { when: { op: 'and', args: [{ op: '==', left: { _t: 2, ref: 'markerState', space: 'alpha:none', marker: 'mood' }, right: 'active' }, { op: '==', left: { _t: 2, ref: 'zoneVar', zone: 'alpha:none', var: 'pressure' }, right: 2 }] }, then: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })] } }),
        eff({
          setVar: {
            scope: 'global',
            var: 'other',
            value: {
              _t: 4,
              if: {
                when: { op: '>', left: { _t: 2, ref: 'gvar', var: 'score' }, right: 12 },
                then: { _t: 2, ref: 'gvar', var: 'score' },
                else: 0,
              },
            },
          },
        }),
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: { conditions: [] },
  markerLattices: [{ id: 'mood', states: ['neutral', 'active'], defaultState: 'neutral' }],
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

function assertCanonicalPreviewState(def: GameDef, state: GameState | undefined, label: string): asserts state is GameState {
  if (state === undefined) {
    assert.fail(`${label}: expected preview state`);
  }
  assert.equal(
    state.stateHash,
    computeFullHash(createZobristTable(def), state),
    `${label}: preview state hash should be canonical`,
  );
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
    const branchPreview = branchRuntime.getPreviewState({ move: branch.trustedMove.move, stableMoveKey: 'candidate', actionId: 'branch' });
    assertCanonicalPreviewState(branchDef, branchPreview, 'chooseOne');
    assert.equal(branchPreview.globalVars.score, 3);

    const chooseNDef = createChooseNDef();
    const chooseN = trustedCandidate(chooseNDef, 'select');
    const chooseNRuntime = createRuntime(chooseNDef, chooseN.state, chooseN.trustedMove, { completionDepthCap: 8 });
    const chooseNPreview = chooseNRuntime.getPreviewState({ move: chooseN.trustedMove.move, stableMoveKey: 'candidate', actionId: 'select' });
    assertCanonicalPreviewState(chooseNDef, chooseNPreview, 'chooseN');
    assert.equal(chooseNPreview.globalVars.score, 5);
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

  it('matches the TypeScript preview driver for the supported encoded preview-drive subset', async () => {
    const wasm = await loadPolicyWasmRuntime();

    const initialApplyDef = createInitialApplyDecisionDrivenDef();
    const initialApply = trustedCandidate(initialApplyDef, 'branch');
    const initialApplyRuntime = createRuntime(initialApplyDef, initialApply.state, initialApply.trustedMove, { completionDepthCap: 8 });
    const initialApplyCandidate = { move: initialApply.trustedMove.move, stableMoveKey: 'candidate', actionId: 'branch' };
    const initialApplyPreview = initialApplyRuntime.getPreviewState(initialApplyCandidate);
    assertCanonicalPreviewState(initialApplyDef, initialApplyPreview, 'initial-application parity reference');
    const initialApplyResult = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-initial-application',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      previewStateSlots: ['global.score'],
      candidates: [{
        actionId: 'branch',
        stableMoveKey: 'candidate',
        initialValue: 0,
        initialPreviewStateValues: [0],
      }],
      steps: [
        { kind: 'applyCandidateDeltas', candidateDeltas: [2] },
        { kind: 'chooseOneGreedy', optionDeltas: [0, 0] },
        { kind: 'addGlobal', delta: 3 },
      ],
    });
    if (initialApplyResult.kind !== 'supported') {
      assert.fail(`initial-application preview-drive parity unexpectedly unsupported: ${initialApplyResult.reason}`);
    }
    assert.deepEqual(initialApplyResult.rows.map((row) => ({ outcome: row.outcome, value: row.value })), [
      { outcome: 'completed', value: initialApplyPreview.globalVars.score },
    ]);
    assert.deepEqual(initialApplyResult.rows.map((row) => row.previewStateValues), [
      { 'global.score': initialApplyPreview.globalVars.score },
    ]);

    const branchDef = createDecisionDrivenDef();
    const branch = trustedCandidate(branchDef, 'branch');
    const branchRuntime = createRuntime(branchDef, branch.state, branch.trustedMove, { completionDepthCap: 8 });
    const branchCandidate = { move: branch.trustedMove.move, stableMoveKey: 'candidate', actionId: 'branch' };
    const branchPreview = branchRuntime.getPreviewState(branchCandidate);
    assertCanonicalPreviewState(branchDef, branchPreview, 'branch parity reference');
    const branchResult = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-greedy',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 10,
      previewStateSlots: ['global.score'],
      candidates: [{
        actionId: 'branch',
        stableMoveKey: 'candidate',
        initialValue: 0,
        initialPreviewStateValues: [0],
      }],
      steps: [
        { kind: 'chooseOneGreedy', optionDeltas: [0, 0] },
        { kind: 'addGlobal', delta: 3 },
      ],
    });
    if (branchResult.kind !== 'supported') {
      assert.fail(`branch preview-drive parity unexpectedly unsupported: ${branchResult.reason}`);
    }
    assert.deepEqual(branchResult.rows.map((row) => ({ outcome: row.outcome, value: row.value })), [
      { outcome: 'completed', value: branchPreview.globalVars.score },
    ]);
    assert.deepEqual(branchResult.rows.map((row) => row.previewStateValues), [
      { 'global.score': branchPreview.globalVars.score },
    ]);

    const chooseNDef = createChooseNDef();
    const chooseN = trustedCandidate(chooseNDef, 'select');
    const chooseNRuntime = createRuntime(chooseNDef, chooseN.state, chooseN.trustedMove, { completionDepthCap: 8 });
    const chooseNPreview = chooseNRuntime.getPreviewState({ move: chooseN.trustedMove.move, stableMoveKey: 'candidate', actionId: 'select' });
    assertCanonicalPreviewState(chooseNDef, chooseNPreview, 'chooseN parity reference');
    const chooseNResult = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-greedy',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      previewStateSlots: ['global.score'],
      candidates: [{
        actionId: 'select',
        stableMoveKey: 'candidate',
        initialValue: 0,
        initialPreviewStateValues: [0],
      }],
      steps: [
        { kind: 'chooseNGreedy', min: 2, max: 2, optionDeltas: [0, 0] },
        { kind: 'addGlobal', delta: 5 },
      ],
    });
    if (chooseNResult.kind !== 'supported') {
      assert.fail(`chooseN preview-drive parity unexpectedly unsupported: ${chooseNResult.reason}`);
    }
    assert.deepEqual(chooseNResult.rows.map((row) => ({ outcome: row.outcome, value: row.value })), [
      { outcome: 'completed', value: chooseNPreview.globalVars.score },
    ]);
    assert.deepEqual(chooseNResult.rows.map((row) => row.previewStateValues), [
      { 'global.score': chooseNPreview.globalVars.score },
    ]);
  });

  it('compiles supported production action-pipeline preview drives into WASM without applying the move in TypeScript', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const def = createInitialApplyDecisionDrivenDef();
    const { state, trustedMove } = trustedCandidate(def, 'branch');
    const referenceRuntime = createRuntime(def, state, trustedMove, { completionDepthCap: 50 });
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'branch' };
    const referencePreview = referenceRuntime.getPreviewState(candidate);
    assertCanonicalPreviewState(def, referencePreview, 'production-substrate reference');

    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: wasm,
      def,
      state,
      profileId: 'synthetic-production-substrate',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      previewStateSlots: ['global.score'],
      candidates: [candidate],
    });

    if (result.kind !== 'supported') {
      assert.fail(`production preview-drive substrate unexpectedly unsupported: ${result.reason}`);
    }
    assert.deepEqual(result.rows.map((row) => ({
      outcome: row.outcome,
      depth: row.depth,
      value: row.value,
      previewStateValues: row.previewStateValues,
    })), [{
      outcome: 'completed',
      depth: 3,
      value: referencePreview.globalVars.score,
      previewStateValues: { 'global.score': referencePreview.globalVars.score },
    }]);
  });

  it('lowers production setVar preview-drive effects through the compiler-owned IR', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const def = createSetVarDecisionDrivenDef();
    const { state, trustedMove } = trustedCandidate(def, 'branch');
    const referenceRuntime = createRuntime(def, state, trustedMove, { completionDepthCap: 12 });
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'branch' };
    const referencePreview = referenceRuntime.getPreviewState(candidate);
    assertCanonicalPreviewState(def, referencePreview, 'production-set-var reference');

    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: wasm,
      def,
      state,
      profileId: 'synthetic-production-set-var',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 50,
      previewStateSlots: ['global.other', 'global.score'],
      candidates: [candidate],
    });

    if (result.kind !== 'supported') {
      assert.fail(`setVar production preview-drive substrate unexpectedly unsupported: ${result.reason}`);
    }
    assert.deepEqual(result.rows.map((row) => ({
      outcome: row.outcome,
      depth: row.depth,
      value: row.value,
      previewStateValues: row.previewStateValues,
    })), [{
      outcome: 'completed',
      depth: 2,
      value: referencePreview.globalVars.other,
      previewStateValues: {
        'global.other': referencePreview.globalVars.other,
        'global.score': referencePreview.globalVars.score,
      },
    }]);
  });

  it('lowers deterministic scalar expressions, query publications, and forEach bindings through production preview-drive IR', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const def = createExpressionDecisionDrivenDef();
    const gameDefRuntime = createGameDefRuntime(def);
    const { state, trustedMove } = trustedCandidate(def, 'branch');
    const candidate = { move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'branch' };

    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: wasm,
      gameDefRuntime,
      def,
      state,
      profileId: 'synthetic-production-expressions',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 10,
      previewStateSlots: ['global.score', 'global.other'],
      candidates: [candidate],
    });

    if (result.kind !== 'supported') {
      assert.fail(`expression production preview-drive substrate unexpectedly unsupported: ${result.reason}`);
    }
    assert.deepEqual(result.rows.map((row) => ({
      outcome: row.outcome,
      depth: row.depth,
      value: row.value,
      previewStateValues: row.previewStateValues,
    })), [{
      outcome: 'completed',
      depth: 8,
      value: 17,
      previewStateValues: {
        'global.score': 17,
        'global.other': 17,
      },
    }]);
  });

  it('fails closed when production preview-drive publication belongs to another seat', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const def = createOtherSeatDef();
    const { state, trustedMove } = trustedCandidate(def, 'ask-other');

    assert.deepEqual(evaluateProductionPreviewDriveBatchWithWasm({
      runtime: wasm,
      def,
      state,
      profileId: 'synthetic-production-other-seat',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      previewStateSlots: ['global.score'],
      candidates: [{ move: trustedMove.move, stableMoveKey: 'candidate', actionId: 'ask-other' }],
    }), {
      kind: 'unsupported',
      profileId: 'synthetic-production-other-seat',
      candidateCount: 1,
      unsupportedDriveClass: 'agent-guided-completion',
      unsupportedOwner: 'production-preview-drive.chooseOne',
      reason: 'only origin-seat greedy chooseOne publication is supported',
    });
  });

  it('fails closed for unsupported encoded preview-drive classes before scoring', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const failedChooseN = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-underfilled-choose-n',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      candidates: [{ actionId: 'select', stableMoveKey: 'candidate', initialValue: 0 }],
      steps: [{ kind: 'chooseNGreedy', min: 3, max: 2, optionDeltas: [0, 0] }, { kind: 'addGlobal', delta: 5 }],
    });
    assert.deepEqual(failedChooseN.kind === 'supported' ? failedChooseN.rows.map((row) => ({ outcome: row.outcome, value: row.value })) : failedChooseN, [{ outcome: 'failed', value: 0 }]);
    assert.deepEqual(wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-gated',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      candidates: [{ actionId: 'blocked', stableMoveKey: 'blocked:{}', initialValue: 0 }],
      steps: [{ kind: 'unsupported', unsupportedClass: 'gated', owner: 'blocked' }],
    }), { kind: 'unsupported', profileId: 'synthetic-gated', candidateCount: 1, unsupportedDriveClass: 'gated', unsupportedOwner: 'blocked', reason: 'unsupported preview-drive class gated' });
  });

  it('preserves caller-visible state while evaluating encoded preview-drive batches', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const def = createDecisionDrivenDef();
    const { state } = trustedCandidate(def, 'branch');
    const beforeHash = state.stateHash;
    const beforeScore = state.globalVars.score;
    if (typeof beforeScore !== 'number') {
      assert.fail('expected numeric score in immutability fixture');
    }

    const result = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-immutability',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      candidates: [{ actionId: 'branch', stableMoveKey: 'candidate', initialValue: beforeScore }],
      steps: [
        { kind: 'chooseOneGreedy', optionDeltas: [0, 0] },
        { kind: 'addGlobal', delta: 3 },
      ],
    });

    assert.equal(result.kind, 'supported');
    assert.equal(state.stateHash, beforeHash);
    assert.equal(state.globalVars.score, beforeScore);
  });
});
