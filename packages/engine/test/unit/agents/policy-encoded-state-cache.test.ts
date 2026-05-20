// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  __policyEncodedStateCache_internal_for_tests as cacheInternals,
  resolvePolicyEncodedState,
} from '../../../src/agents/policy-encoded-state-cache.js';
import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildEncodedState,
  createGameDefRuntime,
  forkGameDefRuntimeForRun,
  initialState,
  type AgentPolicyCatalog,
  type EncodedState,
  type EncodedStateLayout,
  type GameDef,
  type GameDefRuntime,
  type GameState,
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');

function createCatalog(): AgentPolicyCatalog {
  return withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'policy-encoded-state-cache',
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
    globalVars: [{ name: 'score', type: 'int', init: 0, min: -10, max: 10 }],
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
  runtime: GameDefRuntime,
  state: GameState,
  input: { readonly encodedState?: EncodedState } = {},
): PolicyEvaluationContext {
  return new PolicyEvaluationContext(
    {
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog: def.agents as AgentPolicyCatalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      runtime,
      ...(input.encodedState === undefined ? {} : { encodedState: input.encodedState }),
    },
    [],
  );
}

function resolvedEncodedState(context: PolicyEvaluationContext): EncodedState | undefined {
  return (context as unknown as { readonly encodedState: EncodedState | undefined }).encodedState;
}

describe('PolicyEvaluationContext policy encoded-state runtime cache', () => {
  it('keeps projection key sorting locale-independent', () => {
    const source = readFileSync(
      new URL('../../../src/agents/policy-encoded-state-cache.js', import.meta.url),
      'utf8',
    );

    assert.equal(source.includes('localeCompare'), false);
  });

  it('reuses encoded state across contexts sharing the same GameState object and runtime', () => {
    const def = createDef('policy-encoded-state-cache-reuse');
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 172005, 2).state;

    const first = createContext(def, runtime, state);
    const firstEncoded = resolvedEncodedState(first);
    const second = createContext(def, runtime, state);

    assert.ok(firstEncoded !== undefined);
    assert.equal(resolvedEncodedState(second), firstEncoded);
    assert.equal(runtime.policyEncodedStateCache.get(state), firstEncoded);
    assert.deepEqual(firstEncoded, buildEncodedState(state, resolvedLayout(first)));
  });

  it('reuses encoded state for encoded-equivalent distinct GameState objects', () => {
    const def = createDef('policy-encoded-state-cache-distinct-state');
    const runtime = createGameDefRuntime(def);
    const firstState = initialState(def, 172005, 2).state;
    const secondState = { ...initialState(def, 172005, 2).state, turnCount: firstState.turnCount + 1 };

    const firstEncoded = resolvedEncodedState(createContext(def, runtime, firstState));
    const secondEncoded = resolvedEncodedState(createContext(def, runtime, secondState));

    assert.ok(firstEncoded !== undefined);
    assert.ok(secondEncoded !== undefined);
    assert.notEqual(firstState, secondState);
    assert.notEqual(secondState.turnCount, firstState.turnCount);
    assert.equal(secondEncoded, firstEncoded);
    assert.equal(runtime.policyEncodedStateCache.get(firstState), firstEncoded);
    assert.equal(runtime.policyEncodedStateCache.get(secondState), secondEncoded);
    assert.deepEqual(secondEncoded, firstEncoded);
  });

  it('reuses projection-key string segments without changing encoded-state cache semantics', () => {
    const def = createDef('policy-encoded-state-cache-projection-segments');
    const runtime = createGameDefRuntime(def);
    const firstState = initialState(def, 172005, 2).state;
    const secondState = {
      ...firstState,
      turnCount: firstState.turnCount + 1,
      decisionStack: [],
    };
    const layout = resolvedLayout(createContext(def, createGameDefRuntime(def), firstState));
    cacheInternals.resetCounts();

    const firstEncoded = resolvePolicyEncodedState(runtime, firstState, layout, buildEncodedState);
    const secondEncoded = resolvePolicyEncodedState(runtime, secondState, layout, buildEncodedState);

    assert.ok(firstEncoded !== undefined);
    assert.equal(secondEncoded, firstEncoded);
    assert.notEqual(firstState, secondState);
    assert.equal(cacheInternals.getMissCount(), 1);
    assert.equal(cacheInternals.getHashHitCount(), 1);
    assert.ok(cacheInternals.getStableStringifyObjectHitCount() > 0);
    assert.equal(runtime.policyEncodedStateCache.get(secondState), firstEncoded);
  });

  it('does not collide for distinct encoded-state projections with the same stateHash bucket', () => {
    const def = createDef('policy-encoded-state-cache-hash-collision-guard');
    const runtime = createGameDefRuntime(def);
    const firstState = initialState(def, 172005, 2).state;
    const secondState = {
      ...firstState,
      globalVars: { ...firstState.globalVars, score: 1 },
    };

    const firstEncoded = resolvedEncodedState(createContext(def, runtime, firstState));
    const secondEncoded = resolvedEncodedState(createContext(def, runtime, secondState));

    assert.ok(firstEncoded !== undefined);
    assert.ok(secondEncoded !== undefined);
    assert.notEqual(firstState, secondState);
    assert.equal(secondState.stateHash, firstState.stateHash);
    assert.notEqual(secondEncoded, firstEncoded);
    assert.equal(runtime.policyEncodedStateCache.get(firstState), firstEncoded);
    assert.equal(runtime.policyEncodedStateCache.get(secondState), secondEncoded);
    assert.notDeepEqual([...secondEncoded.globals], [...firstEncoded.globals]);
  });

  it('resets the run-local encoded-state cache across runtime forks', () => {
    const def = createDef('policy-encoded-state-cache-fork');
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 172005, 2).state;
    const encoded = resolvedEncodedState(createContext(def, runtime, state));
    const forked = forkGameDefRuntimeForRun(runtime);

    assert.ok(encoded !== undefined);
    assert.equal(runtime.policyEncodedStateCache.get(state), encoded);
    assert.notEqual(forked.policyEncodedStateCache, runtime.policyEncodedStateCache);
    assert.notEqual(forked.policyEncodedStateProjectionCache, runtime.policyEncodedStateProjectionCache);
    assert.equal(forked.policyEncodedStateCache.get(state), undefined);
  });

  it('preserves explicit encodedState precedence', () => {
    const def = createDef('policy-encoded-state-cache-explicit-precedence');
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 172005, 2).state;
    const explicitEncodedState = buildEncodedState(state, resolvedLayout(createContext(def, runtime, state)));
    const context = createContext(def, runtime, state, { encodedState: explicitEncodedState });

    assert.equal(resolvedEncodedState(context), explicitEncodedState);
  });
});

function resolvedLayout(context: PolicyEvaluationContext): EncodedStateLayout {
  return (context as unknown as { readonly encodedStateLayout: EncodedStateLayout }).encodedStateLayout;
}
