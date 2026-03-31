import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import {
  asPhaseId,
  asPlayerId,
  initialState,
  type AgentPolicyCatalog,
  type GameDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

function createMinimalCatalog(overrides?: {
  readonly tolerateRngDivergence?: boolean;
}): AgentPolicyCatalog {
  const profile = {
    fingerprint: 'test-profile',
    params: {},
    use: {
      pruningRules: [],
      scoreTerms: [],
      completionScoreTerms: [],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
    },
    ...(overrides?.tolerateRngDivergence !== undefined
      ? { preview: { tolerateRngDivergence: overrides.tolerateRngDivergence } }
      : {}),
  };
  return {
    schemaVersion: 2,
    catalogFingerprint: 'test-catalog',
    surfaceVisibility: {
      globalVars: {},
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
    profiles: { 'test-profile': profile },
    bindingsBySeat: { us: 'test-profile' },
  };
}

function createDef(catalog: AgentPolicyCatalog): GameDef {
  return {
    metadata: { id: 'policy-runtime-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'them' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  };
}

describe('createPolicyRuntimeProviders', () => {
  it('constructs providers when profile has preview.tolerateRngDivergence = true', () => {
    const catalog = createMinimalCatalog({ tolerateRngDivergence: true });
    const def = createDef(catalog);
    const state = initialState(def, 1, 2).state;

    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.ok(providers.previewSurface, 'previewSurface provider must be present');
    assert.ok(providers.intrinsics, 'intrinsics provider must be present');
    assert.ok(providers.candidates, 'candidates provider must be present');
    assert.ok(providers.currentSurface, 'currentSurface provider must be present');
  });

  it('constructs providers when profile lacks preview config', () => {
    const catalog = createMinimalCatalog();
    const def = createDef(catalog);
    const state = initialState(def, 1, 2).state;

    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.ok(providers.previewSurface, 'previewSurface provider must be present');
  });

  it('constructs providers when seatId has no profile binding', () => {
    const catalog = createMinimalCatalog({ tolerateRngDivergence: true });
    const def = createDef(catalog);
    const state = initialState(def, 1, 2).state;

    // 'them' has no binding in the catalog
    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(1),
      seatId: 'them',
      trustedMoveIndex: new Map(),
      catalog,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.ok(providers.previewSurface, 'previewSurface provider must be present even without profile binding');
  });
});
