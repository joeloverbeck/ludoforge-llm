// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import { getPolicyEncodedStateLayout } from '../../../src/agents/policy-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildEncodedStateLayout,
  initialState,
  type AgentPolicyCatalog,
  type EncodedStateLayout,
  type GameDef,
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');

function createCatalog(): AgentPolicyCatalog {
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'policy-evaluation-core-layout-cache',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      },
      activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      guardrails: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        preview: { mode: 'disabled' },
        selection: { mode: 'argmax' },
        use: { guardrails: [], considerations: [], tieBreakers: [] },
        plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });
}

function createDef(id: string): GameDef {
  return {
    metadata: { id, players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', zoneKind: 'board' },
    ],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createCatalog(),
    actions: [
      {
        id: asActionId('pass'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  };
}

function createContext(
  def: GameDef,
  input: { readonly encodedStateLayout?: EncodedStateLayout } = {},
): PolicyEvaluationContext {
  const { state } = initialState(def, 172002, 2);
  return new PolicyEvaluationContext(
    {
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog: def.agents as AgentPolicyCatalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      ...(input.encodedStateLayout === undefined ? {} : { encodedStateLayout: input.encodedStateLayout }),
    },
    [],
  );
}

function resolvedLayout(context: PolicyEvaluationContext): EncodedStateLayout {
  return (context as unknown as { readonly encodedStateLayout: EncodedStateLayout }).encodedStateLayout;
}

describe('PolicyEvaluationContext encoded-state layout cache', () => {
  it('reuses the policy layout cache for same-def contexts', () => {
    const def = createDef('policy-layout-cache-reuse');

    const first = createContext(def);
    const second = createContext(def);
    const cached = getPolicyEncodedStateLayout(def);

    assert.equal(resolvedLayout(first), cached);
    assert.equal(resolvedLayout(second), cached);
    assert.equal(resolvedLayout(first), resolvedLayout(second));
    assert.deepEqual(resolvedLayout(first), buildEncodedStateLayout(def));
  });

  it('preserves explicit encodedStateLayout precedence', () => {
    const def = createDef('policy-layout-explicit-precedence');
    const explicitLayout = buildEncodedStateLayout(def);

    const context = createContext(def, { encodedStateLayout: explicitLayout });

    assert.equal(resolvedLayout(context), explicitLayout);
    assert.notEqual(resolvedLayout(context), getPolicyEncodedStateLayout(def));
    assert.deepEqual(resolvedLayout(context), getPolicyEncodedStateLayout(def));
  });
});
