// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  definePolicyWasmProductionPreviewStateSlots,
  evaluateProductionPreviewDriveBatchWithWasm,
} from '../../../src/agents/policy-wasm-production-preview-drive.js';
import type { PolicyWasmProductionPreviewDriveCandidate } from '../../../src/agents/policy-wasm-production-preview-drive-types.js';
import type { PolicyWasmRuntime } from '../../../src/agents/policy-wasm-runtime.js';
import {
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createTrustedExecutableMove,
  initialState,
  type ActionDef,
  type CompiledAgentPreviewGrantFlowContinuationConfig,
  type GameDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

const grantFlowContinuation = {
  enabled: true,
  postGrantDepthCap: 4,
  postGrantCapClass: 'postGrant16',
  freeOperationDepthCap: 16,
  freeOperationCapClass: 'grantFlow16',
} as const satisfies CompiledAgentPreviewGrantFlowContinuationConfig;

describe('policy WASM preview-drive grant-flow parity', () => {
  it('forces TypeScript fallback when grant-flow continuation is enabled', () => {
    const { def, candidate } = createCandidateFixture();
    let wasmCalls = 0;

    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: {
        evaluatePreviewDriveBatch: () => {
          wasmCalls += 1;
          assert.fail('grant-flow continuation must fall back before WASM evaluation');
        },
      },
      def,
      state: initialState(def, 185, 2).state,
      profileId: 'synthetic-grant-flow-fallback',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      grantFlowContinuation,
      previewStateSlots: definePolicyWasmProductionPreviewStateSlots(['global.score']),
      candidates: [candidate],
    });

    assert.deepEqual(result, {
      kind: 'unsupported',
      profileId: 'synthetic-grant-flow-fallback',
      candidateCount: 1,
      unsupportedDriveClass: 'grant-flow-continuation',
      unsupportedOwner: 'production-preview-drive.grantFlowContinuation',
      reason: 'production preview-drive requires TypeScript fallback when grant-flow continuation is enabled',
    });
    assert.equal(wasmCalls, 0);
  });

  it('keeps ordinary WASM preview-drive batches supported when grant-flow continuation is absent', () => {
    const { def, candidate } = createCandidateFixture();
    const state = initialState(def, 185, 2).state;
    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: createReadyRuntime(),
      def,
      state,
      profileId: 'synthetic-grant-flow-absent',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      previewStateSlots: definePolicyWasmProductionPreviewStateSlots(['global.score']),
      candidates: [candidate],
    });

    assert.equal(result.kind, 'supported');
    if (result.kind === 'supported') {
      assert.deepEqual(result.rows.map((row) => row.previewSignalCarrier.previewStatus), ['ready']);
    }
  });

  it('keeps ordinary WASM preview-drive batches supported when grant-flow continuation is explicitly disabled', () => {
    const { def, candidate } = createCandidateFixture();
    const state = initialState(def, 185, 2).state;
    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: createReadyRuntime(),
      def,
      state,
      profileId: 'synthetic-grant-flow-disabled',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      grantFlowContinuation: { ...grantFlowContinuation, enabled: false },
      previewStateSlots: definePolicyWasmProductionPreviewStateSlots(['global.score']),
      candidates: [candidate],
    });

    assert.equal(result.kind, 'supported');
    if (result.kind === 'supported') {
      assert.deepEqual(result.rows.map((row) => row.previewSignalCarrier.previewStatus), ['ready']);
    }
  });
});

const createCandidateFixture = (): {
  readonly def: GameDef;
  readonly candidate: PolicyWasmProductionPreviewDriveCandidate;
} => {
  const def = assertValidatedGameDef({
    metadata: { id: 'policy-wasm-preview-grant-flow-parity', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    actions: [{
      id: asActionId('score'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }] satisfies ActionDef[],
    triggers: [],
    terminal: { conditions: [] },
  });
  const state = initialState(def, 185, 2).state;
  const trustedMove = createTrustedExecutableMove({ actionId: asActionId('score'), params: {} }, state.stateHash, 'enumerateLegalMoves');
  return {
    def,
    candidate: {
      move: trustedMove.move,
      stableMoveKey: 'score:{}',
      actionId: 'score',
    },
  };
};

const createReadyRuntime = (): Pick<PolicyWasmRuntime, 'evaluatePreviewDriveBatch'> => ({
  evaluatePreviewDriveBatch: (input) => ({
    kind: 'supported',
    profileId: input.profileId,
    rows: input.candidates.map((candidate) => ({
      stableMoveKey: candidate.stableMoveKey,
      outcome: 'completed',
      depth: 0,
      value: candidate.initialValue,
      previewSignalCarrier: {
        previewStatus: 'ready',
        previewBranch: candidate.previewBranch ?? 'none',
        tiebreakAfterPreviewNoSignal: false,
        policyPreviewSignalUnavailable: false,
      },
    })),
  }),
});
