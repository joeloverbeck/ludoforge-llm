import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyPreviewRuntime, type PolicyPreviewDependencies } from '../../../src/agents/policy-preview.js';
import {
  asActionId,
  asZoneId,
  createTrustedExecutableMove,
  asPhaseId,
  asPlayerId,
  initialState,
  type CompiledPreviewSurfaceRef,
  type GameDef,
  type Move,
  type PlayerObservation,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');
const previewScoreRef: CompiledPreviewSurfaceRef = {
  kind: 'previewSurface',
  family: 'globalVar',
  id: 'score',
};
const previewMarginRef: CompiledPreviewSurfaceRef = {
  kind: 'previewSurface',
  family: 'victoryCurrentMargin',
  id: 'currentMargin',
  selector: { kind: 'role', seatToken: 'us' },
};
const previewSelfTempoRef: CompiledPreviewSurfaceRef = {
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
        globalMarkers: {},
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
        activeCardIdentity: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        activeCardTag: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        activeCardMetadata: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        activeCardAnnotation: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
      },
      parameterDefs: {},
      candidateParamDefs: {},
      library: {
        stateFeatures: {},
        candidateFeatures: {},
        candidateAggregates: {},
        pruningRules: {},
        considerations: {},
        tieBreakers: {},
        strategicConditions: {},
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
    hiddenSamplingZones: hidden ? [asZoneId('some-zone')] : [],
  };
}

function createCandidate(): { readonly move: Move; readonly stableMoveKey: string } {
  return {
    move: { actionId: asActionId('advance'), params: {} },
    stableMoveKey: 'advance|{}|false|unclassified',
  };
}

function createEventCandidate(
  side: 'shaded' | 'unshaded',
  extras?: Readonly<Record<string, string>>,
): { readonly move: Move; readonly stableMoveKey: string } {
  const params = extras === undefined ? { side } : { side, ...extras };
  return {
    move: { actionId: asActionId('event'), params },
    stableMoveKey: `event|${JSON.stringify(params)}|false|event`,
  };
}

function createEventAnnotationIndex(
  grants: Readonly<{
    readonly cardId: string;
    readonly side: 'shaded' | 'unshaded';
    readonly seats: readonly string[];
  }>,
): NonNullable<GameDef['cardAnnotationIndex']> {
  return {
    entries: {
      [grants.cardId]: {
        cardId: grants.cardId,
        [grants.side]: {
          tokenPlacements: {},
          tokenRemovals: {},
          tokenCreations: {},
          tokenDestructions: {},
          markerModifications: 0,
          globalMarkerModifications: 0,
          globalVarModifications: 0,
          perPlayerVarModifications: 0,
          varTransfers: 0,
          drawCount: 0,
          shuffleCount: 0,
          grantsOperation: true,
          grantOperationSeats: grants.seats,
          hasEligibilityOverride: false,
          hasLastingEffect: false,
          hasBranches: false,
          hasPhaseControl: false,
          hasDecisionPoints: false,
          effectNodeCount: 0,
        },
      },
    },
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
      previewMode: 'exactWorld',
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
      previewMode: 'exactWorld',
      dependencies: {
        classifyPlayableMoveCandidate: () => ({ kind: 'rejected', move: candidate.move, rejection: 'notDecisionComplete' }),
        applyMove: () => {
          applyCalls += 1;
          return { state };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), {
      kind: 'unknown',
      reason: 'unresolved',
      failureReason: 'notDecisionComplete',
    });
    assert.equal(runtime.getOutcome(candidate), 'unresolved');
    assert.equal(runtime.getFailureReason(candidate), 'notDecisionComplete');
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
      previewMode: 'exactWorld',
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

  it('skips preview evaluation entirely when preview mode is disabled', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      previewMode: 'disabled',
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          assert.fail('disabled preview mode should not classify moves');
        },
        applyMove: () => {
          assert.fail('disabled preview mode should not apply moves');
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), {
      kind: 'unknown',
      reason: 'failed',
    });
    assert.equal(runtime.getOutcome(candidate), 'failed');
    assert.equal(runtime.getFailureReason(candidate), undefined);
  });

  it('records a preview failure reason when trusted move application throws', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([
        [
          candidate.stableMoveKey,
          createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
        ],
      ]),
      previewMode: 'exactWorld',
      dependencies: {
        applyMove: () => {
          throw new Error('preview explosion for test');
        },
      },
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), {
      kind: 'unknown',
      reason: 'failed',
      failureReason: 'preview explosion for test',
    });
    assert.equal(runtime.getOutcome(candidate), 'failed');
    assert.equal(runtime.getFailureReason(candidate), 'preview explosion for test');
  });

  it('accepts an optional evaluateGrantedOperation callback without changing current preview behavior', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    let callbackCalls = 0;
    const dependencies: PolicyPreviewDependencies = {
      classifyPlayableMoveCandidate: () => ({
        kind: 'playableComplete',
        move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
        warnings: [],
      }),
      applyMove: () => ({
        state: {
          ...state,
          globalVars: { ...state.globalVars, score: 6 },
        },
      }),
      derivePlayerObservation: () => createObservation(false),
      evaluateGrantedOperation: () => {
        callbackCalls += 1;
        return undefined;
      },
    };

    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      previewMode: 'exactWorld',
      dependencies,
    });

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), { kind: 'value', value: 6 });
    assert.equal(runtime.getOutcome(candidate), 'ready');
    assert.equal(callbackCalls, 0);
  });

  it('returns stochastic outcome when rng diverges and preview mode is tolerateStochastic', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      previewMode: 'tolerateStochastic',
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

  it('returns ready outcome when rng does not diverge and preview mode is tolerateStochastic', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      previewMode: 'tolerateStochastic',
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

  it('returns unknown/random when rng diverges and preview mode is exactWorld', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      previewMode: 'exactWorld',
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

  it('resolves stochastic trusted indexed preview with tolerateStochastic mode', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      previewMode: 'tolerateStochastic',
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

  it('produces identical preview values across 3 repeated runs (determinism)', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();

    function runPreview() {
      const runtime = createPolicyPreviewRuntime({
        def,
        state,
        playerId: asPlayerId(0),
        seatId: 'us',
        trustedMoveIndex: new Map(),
        previewMode: 'tolerateStochastic',
        dependencies: {
          classifyPlayableMoveCandidate: () => ({
            kind: 'playableComplete',
            move: createTrustedExecutableMove(candidate.move, state.stateHash, 'templateCompletion'),
            warnings: [],
          }),
          applyMove: () => ({
            state: {
              ...state,
              globalVars: { ...state.globalVars, score: 5 },
              rng: {
                ...state.rng,
                state: [99n, 100n],
              },
            },
          }),
          derivePlayerObservation: () => createObservation(false),
        },
      });

      return {
        surface: runtime.resolveSurface(candidate, previewScoreRef),
        outcome: runtime.getOutcome(candidate),
      };
    }

    const results = [runPreview(), runPreview(), runPreview()];
    for (let i = 1; i < results.length; i++) {
      assert.deepEqual(results[i], results[0], `run ${i + 1} must match run 1`);
    }
    assert.deepEqual(results[0]!.surface, { kind: 'value', value: 5 });
    assert.equal(results[0]!.outcome, 'stochastic');
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
      previewMode: 'exactWorld',
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
      previewMode: 'exactWorld',
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
      previewMode: 'exactWorld',
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
      previewMode: 'exactWorld',
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
      previewMode: 'exactWorld',
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
      previewMode: 'exactWorld',
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

    assert.deepEqual(runtime.resolveSurface(candidate, previewScoreRef), {
      kind: 'unknown',
      reason: 'failed',
      failureReason: 'sourceStateHashMismatch',
    });
    assert.equal(runtime.getOutcome(candidate), 'failed');
    assert.equal(runtime.getFailureReason(candidate), 'sourceStateHashMismatch');
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
      previewMode: 'exactWorld',
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

  it('preserves side-specific projected margins for trusted dual-sided event previews', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const shaded = createEventCandidate('shaded');
    const unshaded = createEventCandidate('unshaded');
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([
        [shaded.stableMoveKey, createTrustedExecutableMove(shaded.move, state.stateHash, 'templateCompletion')],
        [unshaded.stableMoveKey, createTrustedExecutableMove(unshaded.move, state.stateHash, 'templateCompletion')],
      ]),
      previewMode: 'exactWorld',
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          assert.fail('trusted event preview should not reclassify candidates');
        },
        applyMove: (_def, currentState, trustedMove) => ({
          state: {
            ...currentState,
            globalVars: {
              ...currentState.globalVars,
              score: trustedMove.move.params.side === 'shaded' ? 6 : -2,
            },
          },
        }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(shaded, previewScoreRef), { kind: 'value', value: 6 });
    assert.deepEqual(runtime.resolveSurface(unshaded, previewScoreRef), { kind: 'value', value: -2 });
    assert.equal(runtime.getOutcome(shaded), 'ready');
    assert.equal(runtime.getOutcome(unshaded), 'ready');
  });

  it('keeps capability-style trusted event previews ready even when immediate margin does not change', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const capability = createEventCandidate('unshaded', { cardId: 'cap-cadres' });
    let applyCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([[
        capability.stableMoveKey,
        createTrustedExecutableMove(capability.move, state.stateHash, 'templateCompletion'),
      ]]),
      previewMode: 'exactWorld',
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          assert.fail('trusted capability preview should not reclassify candidates');
        },
        applyMove: () => {
          applyCalls += 1;
          return { state };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(capability, previewScoreRef), { kind: 'value', value: 1 });
    assert.equal(runtime.getOutcome(capability), 'ready');
    assert.equal(applyCalls, 1);
  });

  it('returns stochastic for trusted event previews under tolerateStochastic when rng diverges', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const stochasticEvent = createEventCandidate('shaded', { cardId: 'card-random' });
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([[
        stochasticEvent.stableMoveKey,
        createTrustedExecutableMove(stochasticEvent.move, state.stateHash, 'templateCompletion'),
      ]]),
      previewMode: 'tolerateStochastic',
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          assert.fail('trusted stochastic preview should not reclassify candidates');
        },
        applyMove: () => ({
          state: {
            ...state,
            globalVars: {
              ...state.globalVars,
              score: 7,
            },
            rng: {
              ...state.rng,
              state: [11n, 12n],
            },
          },
        }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(stochasticEvent, previewScoreRef), { kind: 'value', value: 7 });
    assert.equal(runtime.getOutcome(stochasticEvent), 'stochastic');
  });

  it('simulates a granted operation for a trusted granting event when the acting seat is a grantee', () => {
    const cardId = 'card-grant';
    const def = {
      ...createDef(),
      cardAnnotationIndex: createEventAnnotationIndex({ cardId, side: 'shaded', seats: ['us'] }),
    };
    const state = initialState(def, 1, 2).state;
    const eventCandidate = createEventCandidate('shaded', { eventCardId: cardId, eventDeckId: 'main' });
    const operationMove: Move = { actionId: asActionId('rally'), params: { target: 'alpha:none' } };
    let callbackCalls = 0;
    let classifyCalls = 0;
    let applyCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([
        [eventCandidate.stableMoveKey, createTrustedExecutableMove(eventCandidate.move, state.stateHash, 'templateCompletion')],
      ]),
      previewMode: 'exactWorld',
      dependencies: {
        classifyPlayableMoveCandidate: (_def, currentState, move) => {
          classifyCalls += 1;
          if (currentState === state) {
            assert.fail('trusted event preview should not reclassify the outer event candidate');
          }
          assert.deepEqual(move, operationMove);
          return {
            kind: 'playableComplete',
            move: createTrustedExecutableMove(move, currentState.stateHash, 'templateCompletion'),
            warnings: [],
          };
        },
        evaluateGrantedOperation: (_def, postEventState, seatId) => {
          callbackCalls += 1;
          assert.equal(seatId, 'us');
          assert.equal(postEventState.globalVars.score, 4);
          return { move: operationMove, score: 11 };
        },
        applyMove: (_def, currentState, trustedMove) => {
          applyCalls += 1;
          return {
            state: {
              ...currentState,
              globalVars: {
                ...currentState.globalVars,
                score: trustedMove.move.actionId === asActionId('event') ? 4 : 9,
              },
            },
          };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(eventCandidate, previewScoreRef), { kind: 'value', value: 9 });
    assert.equal(runtime.getOutcome(eventCandidate), 'ready');
    assert.equal(callbackCalls, 1);
    assert.equal(classifyCalls, 1);
    assert.equal(applyCalls, 2);
  });

  it('does not simulate a granted operation when the acting seat is not a grantee', () => {
    const cardId = 'card-opponent-grant';
    const def = {
      ...createDef(),
      cardAnnotationIndex: createEventAnnotationIndex({ cardId, side: 'shaded', seats: ['arvn'] }),
    };
    const state = initialState(def, 1, 2).state;
    const eventCandidate = createEventCandidate('shaded', { eventCardId: cardId, eventDeckId: 'main' });
    let callbackCalls = 0;
    let applyCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([
        [eventCandidate.stableMoveKey, createTrustedExecutableMove(eventCandidate.move, state.stateHash, 'templateCompletion')],
      ]),
      previewMode: 'exactWorld',
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          assert.fail('trusted event preview should not reclassify the outer event candidate');
        },
        evaluateGrantedOperation: () => {
          callbackCalls += 1;
          return undefined;
        },
        applyMove: (_def, currentState) => {
          applyCalls += 1;
          return {
            state: {
              ...currentState,
              globalVars: { ...currentState.globalVars, score: 3 },
            },
          };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(eventCandidate, previewScoreRef), { kind: 'value', value: 3 });
    assert.equal(runtime.getOutcome(eventCandidate), 'ready');
    assert.equal(callbackCalls, 0);
    assert.equal(applyCalls, 1);
  });

  it('treats self grantOperationSeats entries as the acting seat', () => {
    const cardId = 'card-self-grant';
    const def = {
      ...createDef(),
      cardAnnotationIndex: createEventAnnotationIndex({ cardId, side: 'shaded', seats: ['self'] }),
    };
    const state = initialState(def, 1, 2).state;
    const eventCandidate = createEventCandidate('shaded', { eventCardId: cardId, eventDeckId: 'main' });
    let callbackCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([
        [eventCandidate.stableMoveKey, createTrustedExecutableMove(eventCandidate.move, state.stateHash, 'templateCompletion')],
      ]),
      previewMode: 'exactWorld',
      dependencies: {
        classifyPlayableMoveCandidate: (_def, currentState, move) => ({
          kind: 'playableComplete',
          move: createTrustedExecutableMove(move, currentState.stateHash, 'templateCompletion'),
          warnings: [],
        }),
        evaluateGrantedOperation: () => {
          callbackCalls += 1;
          return { move: { actionId: asActionId('rally'), params: {} }, score: 5 };
        },
        applyMove: (_def, currentState, trustedMove) => ({
          state: {
            ...currentState,
            globalVars: {
              ...currentState.globalVars,
              score: trustedMove.move.actionId === asActionId('event') ? 2 : 8,
            },
          },
        }),
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(eventCandidate, previewScoreRef), { kind: 'value', value: 8 });
    assert.equal(callbackCalls, 1);
  });

  it('falls back to the post-event state when the granted operation callback returns undefined', () => {
    const cardId = 'card-no-op';
    const def = {
      ...createDef(),
      cardAnnotationIndex: createEventAnnotationIndex({ cardId, side: 'shaded', seats: ['us'] }),
    };
    const state = initialState(def, 1, 2).state;
    const eventCandidate = createEventCandidate('shaded', { eventCardId: cardId, eventDeckId: 'main' });
    let callbackCalls = 0;
    let applyCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([
        [eventCandidate.stableMoveKey, createTrustedExecutableMove(eventCandidate.move, state.stateHash, 'templateCompletion')],
      ]),
      previewMode: 'exactWorld',
      dependencies: {
        classifyPlayableMoveCandidate: () => {
          assert.fail('no granted operation move should be classified when the callback returns undefined');
        },
        evaluateGrantedOperation: () => {
          callbackCalls += 1;
          return undefined;
        },
        applyMove: (_def, currentState) => {
          applyCalls += 1;
          return {
            state: {
              ...currentState,
              globalVars: { ...currentState.globalVars, score: 4 },
            },
          };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(eventCandidate, previewScoreRef), { kind: 'value', value: 4 });
    assert.equal(callbackCalls, 1);
    assert.equal(applyCalls, 1);
  });

  it('caps granted-operation preview depth at one additional applied move', () => {
    const cardId = 'card-depth-cap';
    const def = {
      ...createDef(),
      cardAnnotationIndex: createEventAnnotationIndex({ cardId, side: 'shaded', seats: ['us'] }),
    };
    const state = initialState(def, 1, 2).state;
    const eventCandidate = createEventCandidate('shaded', { eventCardId: cardId, eventDeckId: 'main' });
    let callbackCalls = 0;
    let applyCalls = 0;
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map([
        [eventCandidate.stableMoveKey, createTrustedExecutableMove(eventCandidate.move, state.stateHash, 'templateCompletion')],
      ]),
      previewMode: 'exactWorld',
      dependencies: {
        classifyPlayableMoveCandidate: (_def, currentState, move) => ({
          kind: 'playableComplete',
          move: createTrustedExecutableMove(move, currentState.stateHash, 'templateCompletion'),
          warnings: [],
        }),
        evaluateGrantedOperation: () => {
          callbackCalls += 1;
          return { move: { actionId: asActionId('rally'), params: { step: 'granted' } }, score: 7 };
        },
        applyMove: (_def, currentState, trustedMove) => {
          applyCalls += 1;
          return {
            state: {
              ...currentState,
              globalVars: {
                ...currentState.globalVars,
                score: trustedMove.move.actionId === asActionId('event') ? 2 : 5,
              },
            },
          };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.deepEqual(runtime.resolveSurface(eventCandidate, previewScoreRef), { kind: 'value', value: 5 });
    assert.equal(callbackCalls, 1);
    assert.equal(applyCalls, 2);
  });
});
