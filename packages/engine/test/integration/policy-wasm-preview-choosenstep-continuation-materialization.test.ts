// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerPolicyWasmDeepContinuationDecision } from '../../src/agents/policy-wasm-preview-choosenstep-continuation.js';
import { materializePolicyWasmPreviewStatePatch } from '../../src/agents/policy-wasm-preview-drive-state-patch.js';
import { loadPolicyWasmRuntime } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import type { Decision } from '../../src/kernel/microturn/types.js';
import type { ChooseOneContext } from '../../src/kernel/microturn/types.js';
import { applyPublishedDecision } from '../../src/kernel/microturn/apply.js';
import {
  resetHotPathProfilerCounters,
  setHotPathProfilingEnabled,
  snapshotHotPathProfilerCounters,
} from '../../src/kernel/perf-profiler.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  initialState,
  publishMicroturn,
  serializeGameState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { createChoosenStepPreviewFixture } from '../unit/agents/policy-preview-inner-choosenstep-fixture.js';

type ChooseNStepDecision = Extract<Decision, { readonly kind: 'chooseNStep' }>;
type ChooseOneDecision = Extract<Decision, { readonly kind: 'chooseOne' }>;

const phaseId = asPhaseId('main');

function createChooseOneContinuationFixture(): {
  readonly def: GameDef;
  readonly state: GameState;
  readonly microturn: ReturnType<typeof publishMicroturn> & {
    readonly kind: 'chooseOne';
    readonly decisionContext: ChooseOneContext;
  };
  readonly decision: ChooseOneDecision;
} {
  const def = assertValidatedGameDef({
    metadata: { id: 'policy-wasm-chooseone-continuation-materialization', players: { min: 2, max: 2 } },
    seats: [{ id: 'us' }, { id: 'arvn' }],
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    actions: [
      {
        id: asActionId('draft-and-mode'),
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
      id: 'draft-and-mode-pipeline',
      actionId: asActionId('draft-and-mode'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$picks',
              bind: '$picks',
              options: { query: 'enums', values: ['first', 'second'] },
              n: 1,
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$mode',
              bind: '$mode',
              options: { query: 'enums', values: ['small', 'large'] },
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({ addVar: { scope: 'global', var: 'score', delta: 1 } }) as ActionPipelineDef['stages'][number]['effects'][number],
        ],
      }],
      atomicity: 'partial',
    }],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'score' } },
        { seat: 'arvn', value: 0 },
      ],
    },
  });
  const initial = initialState(def, 174017, 2).state;
  const actionSelection = publishMicroturn(def, initial);
  const action = actionSelection.legalActions[0];
  assert.ok(action);
  const afterAction = applyPublishedDecision(
    def,
    initial,
    actionSelection,
    action,
    { advanceToDecisionPoint: true },
  ).state;
  const chooseN = publishMicroturn(def, afterAction);
  assert.equal(chooseN.kind, 'chooseNStep');
  const add = chooseN.legalActions.find((candidate): candidate is ChooseNStepDecision =>
    candidate.kind === 'chooseNStep' && candidate.command === 'add' && candidate.value === 'first');
  assert.ok(add);
  const afterAdd = applyPublishedDecision(
    def,
    afterAction,
    chooseN,
    add,
    { advanceToDecisionPoint: true },
  ).state;
  const confirmMicroturn = publishMicroturn(def, afterAdd);
  assert.equal(confirmMicroturn.kind, 'chooseNStep');
  const confirm = confirmMicroturn.legalActions.find((candidate): candidate is ChooseNStepDecision =>
    candidate.kind === 'chooseNStep' && candidate.command === 'confirm');
  assert.ok(confirm);
  const state = applyPublishedDecision(
    def,
    afterAdd,
    confirmMicroturn,
    confirm,
    { advanceToDecisionPoint: true },
  ).state;
  const microturn = publishMicroturn(def, state);
  assert.equal(microturn.kind, 'chooseOne');
  const decision = microturn.legalActions.find((candidate): candidate is ChooseOneDecision =>
    candidate.kind === 'chooseOne' && candidate.value === 'small');
  assert.ok(decision);
  return {
    def,
    state,
    microturn: microturn as ReturnType<typeof publishMicroturn> & {
      readonly kind: 'chooseOne';
      readonly decisionContext: ChooseOneContext;
    },
    decision,
  };
}

describe('policy WASM chooseNStep continuation state-patch materialization', () => {
  it('round-trips WASM-returned continuation patches and materializes byte-equivalent projected state', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const fixture = createChoosenStepPreviewFixture();
    const decision = fixture.microturn.legalActions.find((candidate): candidate is ChooseNStepDecision =>
      candidate.kind === 'chooseNStep' && candidate.command === 'add' && candidate.value !== undefined);
    assert.ok(decision);

    const lowered = lowerPolicyWasmDeepContinuationDecision({
      state: fixture.state,
      microturn: fixture.microturn,
      decision,
      initialValue: 0,
    });
    assert.equal(lowered.kind, 'supported');
    if (lowered.kind !== 'supported') {
      return;
    }

    const result = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-choosenstep-continuation-materialization',
      originSeatId: fixture.microturn.seatId,
      originTurnId: fixture.microturn.turnId,
      depthCap: 4,
      candidates: [lowered.candidate],
      steps: [],
      materializeStatePatch: true,
    });

    if (result.kind !== 'supported') {
      assert.fail(`chooseNStep continuation fixture unexpectedly unsupported: ${result.reason}`);
    }
    assert.equal(result.rows[0]?.statePatch?.ops[0]?.kind, 'applyChooseNStepDecision');

    resetHotPathProfilerCounters();
    setHotPathProfilingEnabled(true);
    let materialized: GameState | undefined;
    try {
      materialized = materializePolicyWasmPreviewStatePatch({
        def: fixture.def,
        state: fixture.state,
        patch: result.rows[0]!.statePatch!,
      }).state;
    } finally {
      setHotPathProfilingEnabled(false);
    }
    assert.equal(
      snapshotHotPathProfilerCounters().find((bucket) => bucket.key === 'policyWasmStatePatch:reuseAppliedStateHash')?.count,
      1,
    );
    assert.ok(materialized);
    const reference = applyPublishedDecision(
      fixture.def,
      fixture.state,
      fixture.microturn,
      decision,
      { advanceToDecisionPoint: true },
    ).state;

    assert.equal(
      serializeGameState(materialized).stateHash,
      serializeGameState(reference).stateHash,
    );
    assert.deepEqual(serializeGameState(materialized), serializeGameState(reference));
  });

  it('round-trips WASM-returned chooseOne continuation patches and materializes byte-equivalent projected state', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const fixture = createChooseOneContinuationFixture();

    const lowered = lowerPolicyWasmDeepContinuationDecision({
      state: fixture.state,
      microturn: fixture.microturn,
      decision: fixture.decision,
      initialValue: 0,
    });
    assert.equal(lowered.kind, 'supported');
    if (lowered.kind !== 'supported') {
      return;
    }

    const result = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-chooseone-continuation-materialization',
      originSeatId: fixture.microturn.seatId,
      originTurnId: fixture.microturn.turnId,
      depthCap: 4,
      candidates: [lowered.candidate],
      steps: [],
      materializeStatePatch: true,
    });

    if (result.kind !== 'supported') {
      assert.fail(`chooseOne continuation fixture unexpectedly unsupported: ${result.reason}`);
    }
    assert.equal(result.rows[0]?.statePatch?.ops[0]?.kind, 'applyChooseOneDecision');

    resetHotPathProfilerCounters();
    setHotPathProfilingEnabled(true);
    let materialized: GameState | undefined;
    try {
      materialized = materializePolicyWasmPreviewStatePatch({
        def: fixture.def,
        state: fixture.state,
        patch: result.rows[0]!.statePatch!,
      }).state;
    } finally {
      setHotPathProfilingEnabled(false);
    }
    assert.equal(
      snapshotHotPathProfilerCounters().find((bucket) => bucket.key === 'policyWasmStatePatch:reuseAppliedStateHash')?.count,
      1,
    );
    assert.ok(materialized);
    const reference = applyPublishedDecision(
      fixture.def,
      fixture.state,
      fixture.microturn,
      fixture.decision,
      { advanceToDecisionPoint: true },
    ).state;

    assert.equal(
      serializeGameState(materialized).stateHash,
      serializeGameState(reference).stateHash,
    );
    assert.deepEqual(serializeGameState(materialized), serializeGameState(reference));
  });
});
