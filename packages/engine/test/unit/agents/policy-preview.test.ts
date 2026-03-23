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

    assert.equal(runtime.resolveSurface(candidate, previewScoreRef), 4);
    assert.equal(runtime.resolveSurface(candidate, previewScoreRef), 4);
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
      dependencies: {
        classifyPlayableMoveCandidate: () => ({ kind: 'rejected', move: candidate.move, rejection: 'notDecisionComplete' }),
        applyMove: () => {
          applyCalls += 1;
          return { state };
        },
        derivePlayerObservation: () => createObservation(false),
      },
    });

    assert.equal(runtime.resolveSurface(candidate, previewScoreRef), undefined);
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

    assert.equal(runtime.resolveSurface(candidate, previewScoreRef), undefined);
  });

  it('keeps safe preview refs available while masking unsafe refs when hidden sampling remains', () => {
    const def = createDef();
    const state = initialState(def, 1, 2).state;
    const candidate = createCandidate();
    const runtime = createPolicyPreviewRuntime({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
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

    assert.equal(runtime.resolveSurface(candidate, previewScoreRef), 9);
    assert.equal(runtime.resolveSurface(candidate, previewMarginRef), undefined);
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

    assert.equal(runtime.resolveSurface(candidate, previewSelfTempoRef), 7);
  });
});
