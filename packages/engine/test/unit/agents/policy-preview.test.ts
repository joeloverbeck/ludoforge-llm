import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyPreviewRuntime } from '../../../src/agents/policy-preview.js';
import {
  asActionId,
  createTrustedExecutableMove,
  asPhaseId,
  asPlayerId,
  initialState,
  type CompiledAgentPolicyPreviewSurfaceRef,
  type GameDef,
  type Move,
  type PlayerObservation,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');
const previewScoreRef: CompiledAgentPolicyPreviewSurfaceRef = {
  kind: 'previewSurface',
  family: 'globalVar',
  id: 'score',
};
const previewMarginRef: CompiledAgentPolicyPreviewSurfaceRef = {
  kind: 'previewSurface',
  family: 'victoryCurrentMargin',
  id: 'currentMargin',
  selector: { kind: 'role', seatToken: 'us' },
};
const previewSelfTempoRef: CompiledAgentPolicyPreviewSurfaceRef = {
  kind: 'previewSurface',
  family: 'perPlayerVar',
  id: 'tempo',
  selector: { kind: 'player', player: 'self' },
};

function createDef(): GameDef {
  return {
    metadata: { id: 'policy-preview-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 1, min: -10, max: 10 }],
    perPlayerVars: [{ name: 'tempo', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: {
      schemaVersion: 2,
      catalogFingerprint: 'preview-catalog',
      surfaceVisibility: {
        globalVars: {
          score: {
            current: 'public',
            preview: { visibility: 'public', allowWhenHiddenSampling: true },
          },
        },
        perPlayerVars: {
          tempo: {
            current: 'seatVisible',
            preview: { visibility: 'seatVisible', allowWhenHiddenSampling: true },
          },
        },
        derivedMetrics: {},
        victory: {
          currentMargin: {
            current: 'hidden',
            preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
          },
          currentRank: {
            current: 'hidden',
            preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
          },
        },
      },
      parameterDefs: {},
      candidateParamDefs: {},
      library: {
        stateFeatures: {},
        candidateFeatures: {},
        candidateAggregates: {},
        pruningRules: {},
        scoreTerms: {},
        completionScoreTerms: {},
        tieBreakers: {},
      },
      profiles: {},
      bindingsBySeat: {},
    },
    actions: [],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'score' } },
        { seat: 'arvn', value: 0 },
      ],
    },
  };
}

function createObservation(hidden: boolean): PlayerObservation {
  return {
    observer: asPlayerId(0),
    visibleTokenIdsByZone: {},
    visibleTokenOrderByZone: {},
    visibleRevealsByZone: {},
    requiresHiddenSampling: hidden,
  };
}

function createCandidate(): { readonly move: Move; readonly stableMoveKey: string } {
  return {
    move: { actionId: asActionId('advance'), params: {} },
    stableMoveKey: 'advance|{}|false|unclassified',
  };
}

describe('policy-preview', () => {
  it('caches preview application per candidate', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    let probeCalls = 0;
    let applyCalls = 0;
    let observationCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          probeCalls += 1;
          return { kind: 'playableComplete', move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'), warnings: [] };
        },
        applyMove: () => {
          applyCalls += 1;
          return {
            state: {
              ...state,
              globalVars: {
                ...state.globalVars,
                score: 4,
              },
            },
          };
        },
        derivePlayerObservation: () => {
          observationCalls += 1;
          return createObservation(false);
        },
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 4 });
    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 4 });
    assert.equal(runtime.getOutcome(candidate), 'ready');
    assert.equal(probeCalls, 1);
    assert.equal(applyCalls, 1);
    assert.equal(observationCalls, 1);
  });

  it('masks unresolved preview states to unknown', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    let applyCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      dependencies: {
        classifyPlayableMoveCandidate: () => ({ kind: 'rejected', move: candidate.move, rejection: 'notDecisionComplete' }),
        applyMove: () => {
          applyCalls += 1;
          return { state };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'unknown', reason: 'unresolved' });
    assert.equal(runtime.getOutcome(candidate), 'unresolved');
    assert.equal(applyCalls, 0);
  });

  it('masks preview refs when the move consumes rng', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      dependencies: {
        classifyPlayableMoveCandidate: () => ({
          kind: 'playableComplete',
          move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
          warnings: [],
        }),
        applyMove: () => ({
          state: {
            ...state,
            rng: {
              ...state.rng,
              state: [2n, 3n],
            },
          },
        }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'unknown', reason: 'random' });
    assert.equal(runtime.getOutcome(candidate), 'random');
  });

  it('returns stochastic outcome when rng diverges and tolerateRngDivergence is true', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      tolerateRngDivergence: true,
      dependencies: {
        classifyPlayableMoveCandidate: () => ({
          kind: 'playableComplete',
          move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
          warnings: [],
        }),
        applyMove: () => ({
          state: {
            ...state,
            globalVars: { ...state.globalVars, score: 7 },
            rng: {
              ...state.rng,
              state: [2n, 3n],
            },
          },
        }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 7 });
    assert.equal(runtime.getOutcome(candidate), 'stochastic');
  });

  it('returns ready outcome when rng does not diverge and tolerateRngDivergence is true', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      tolerateRngDivergence: true,
      dependencies: {
        classifyPlayableMoveCandidate: () => ({
          kind: 'playableComplete',
          move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
          warnings: [],
        }),
        applyMove: () => ({
          state: {
            ...state,
            globalVars: { ...state.globalVars, score: 3 },
          },
        }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 3 });
    assert.equal(runtime.getOutcome(candidate), 'ready');
  });

  it('returns unknown/random when rng diverges and tolerateRngDivergence is false', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      tolerateRngDivergence: false,
      dependencies: {
        classifyPlayableMoveCandidate: () => ({
          kind: 'playableComplete',
          move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
          warnings: [],
        }),
        applyMove: () => ({
          state: {
            ...state,
            rng: {
              ...state.rng,
              state: [2n, 3n],
            },
          },
        }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'unknown', reason: 'random' });
    assert.equal(runtime.getOutcome(candidate), 'random');
  });

  it('resolves stochastic trusted indexed preview with tolerateRngDivergence', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      tolerateRngDivergence: true,
      trustedMoveIndex: new Map([[
        candidate.stableMoveKey,
        createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
      ]]),
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          assert.fail('trusted preview path should not fall back to classification');
        },
        applyMove: () => ({
          state: {
            ...state,
            globalVars: { ...state.globalVars, score: 5 },
            rng: {
              ...state.rng,
              state: [9n, 10n],
            },
          },
        }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 5 });
    assert.equal(runtime.getOutcome(candidate), 'stochastic');
  });

  it('keeps safe preview refs available while masking unsafe refs when hidden sampling remains', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def: {
        ...def,
        agents: {
          ...def.agents!,
          surfaceVisibility: {
            ...def.agents!.surfaceVisibility,
            victory: {
              ...def.agents!.surfaceVisibility.victory,
              currentMargin: {
                current: 'hidden',
                preview: { visibility: 'public', allowWhenHiddenSampling: false },
              },
            },
          },
        },
      },
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      dependencies: {
        classifyPlayableMoveCandidate: () => ({
          kind: 'playableComplete',
          move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
          warnings: [],
        }),
        applyMove: () => ({
          state: {
            ...state,
            globalVars: {
              ...state.globalVars,
              score: 9,
            },
          },
        }),
        derivePlayerObservation: () => createObservation(true),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 9 });
    assert.deepEqual(runtime.resolveSurface(candidate, previewMarginRef), { kind: 'unknown', reason: 'hidden' });
  });

  it('resolves player-scoped preview per-player refs by runtime player identity', () => {
    const def = createDef();
    const baseState = initialState(def, 1, 2).state;
    const state = {
      ...baseState,
      perPlayerVars: [
        { tempo: 2 },
        { tempo: 7 },
      ],
      activePlayer: asPlayerId(0),
    };
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def: {
        ...def,
        seats: [{ id: 'neutral' }, { id: 'neutral' }],
      },
      state,
      playerId: asPlayerId(1),
      seatId: 'neutral',
      trustedMoveIndex: new Map(),
      dependencies: {
        classifyPlayableMoveCandidate: () => ({
          kind: 'playableComplete',
          move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
          warnings: [],
        }),
        applyMove: () => ({ state }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewSelfTempoRef), { kind: 'value', value: 7 });
  });

  it('uses a trusted move from the index instead of reclassifying the candidate', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    let probeCalls = 0;
    let applyCalls = 0;
    const trustedMove = createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion');
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([[candidate.stableMoveKey, trustedMove]]),
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          probeCalls += 1;
          return { kind: 'rejected', move: candidate.move, rejection: 'notDecisionComplete' };
        },
        applyMove: () => {
          applyCalls += 1;
          return {
            state: {
              ...state,
              globalVars: {
                ...state.globalVars,
                score: 8,
              },
            },
          };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 8 });
    assert.equal(probeCalls, 0);
    assert.equal(applyCalls, 1);
  });

  it('masks trusted indexed preview states when the move consumes rng', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    let probeCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([[
        candidate.stableMoveKey,
        createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
      ]]),
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          probeCalls += 1;
          return { kind: 'rejected', move: candidate.move, rejection: 'notDecisionComplete' };
        },
        applyMove: () => ({
          state: {
            ...state,
            rng: {
              ...state.rng,
              state: [2n, 3n],
            },
          },
        }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'unknown', reason: 'random' });
    assert.equal(probeCalls, 0);
  });

  it('caches trusted indexed preview application per candidate', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    let probeCalls = 0;
    let applyCalls = 0;
    let observationCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([[
        candidate.stableMoveKey,
        createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
      ]]),
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          probeCalls += 1;
          return { kind: 'rejected', move: candidate.move, rejection: 'notDecisionComplete' };
        },
        applyMove: () => {
          applyCalls += 1;
          return {
            state: {
              ...state,
              globalVars: {
                ...state.globalVars,
                score: 6,
              },
            },
          };
        },
        derivePlayerObservation: () => {
          observationCalls += 1;
          return createObservation(false);
        },
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 6 });
    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 6 });
    assert.equal(probeCalls, 0);
    assert.equal(applyCalls, 1);
    assert.equal(observationCalls, 1);
  });

  it('rejects trusted preview application when the move source hash does not match the current state', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    let applyCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([[
        candidate.stableMoveKey,
        createTrustedExecutableMove(candidate.move, state.stateHash + 1n, 'templateCompletion'),
      ]]),
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          assert.fail('trusted preview path should not fall back to classification');
        },
        applyMove: () => {
          applyCalls += 1;
          return { state };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'unknown', reason: 'failed' });
    assert.equal(runtime.getOutcome(candidate), 'failed');
    assert.equal(applyCalls, 0);
  });

  it('falls back to classification when the trusted move index is empty', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    let probeCalls = 0;
    let applyCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          probeCalls += 1;
          return {
            kind: 'playableComplete',
            move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
            warnings: [],
          };
        },
        applyMove: () => {
          applyCalls += 1;
          return {
            state: {
              ...state,
              globalVars: {
                ...state.globalVars,
                score: 5,
              },
            },
          };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 5 });
    assert.equal(probeCalls, 1);
    assert.equal(applyCalls, 1);
  });
});
