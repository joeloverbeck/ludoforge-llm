import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyPreviewRuntime } from '../../../src/agents/policy-preview.js';
import type { PolicyPreviewSurfaceRef } from '../../../src/agents/policy-runtime.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
  type Move,
  type PlayerObservation,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');
const previewScoreRef: PolicyPreviewSurfaceRef = {
  kind: 'surface',
  phase: 'preview',
  family: 'globalVar',
  id: 'score',
};
const previewMarginRef: PolicyPreviewSurfaceRef = {
  kind: 'surface',
  phase: 'preview',
  family: 'victoryCurrentMargin',
  id: 'currentMargin',
  seatToken: 'us',
};

function createDef(): GameDef {
  return {
    metadata: { id: 'policy-preview-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 1, min: -10, max: 10 }],
    perPlayerVars: [],
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
        perPlayerVars: {},
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
        { seat: 'us', value: { ref: 'gvar', var: 'score' } },
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
        probeMoveViability: () => {
          probeCalls += 1;
          return { viable: true, complete: true, move: candidate.move, warnings: [] };
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
        probeMoveViability: () => ({ viable: true, complete: false, move: candidate.move, warnings: [] }),
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
        probeMoveViability: () => ({ viable: true, complete: true, move: candidate.move, warnings: [] }),
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
        probeMoveViability: () => ({ viable: true, complete: true, move: candidate.move, warnings: [] }),
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
});
