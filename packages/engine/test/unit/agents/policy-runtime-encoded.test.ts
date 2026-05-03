// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import {
  __internal_for_tests as policyWasmRuntimeInternals,
  type PolicyWasmRuntime,
} from '../../../src/agents/policy-wasm-runtime.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createTrustedExecutableMove,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentDependencyRefs,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const actionId = asActionId('choose');
const emptyDeps: CompiledAgentDependencyRefs = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
};

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });

function createCatalog(): AgentPolicyCatalog {
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'encoded-policy-runtime-test',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        currentRank: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
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
      pruningRules: {},
      considerations: {
        boardStrength: {
          scopes: ['move'],
          costClass: 'state',
          weight: literal(1),
          value: {
            kind: 'globalTokenAgg',
            zoneScope: 'board',
            tokenFilter: { type: 'unit', props: { faction: { eq: 'US' }, elite: { eq: true } } },
            prop: 'strength',
            aggOp: 'sum',
          },
          dependencies: emptyDeps,
        },
        adjacentThreat: {
          scopes: ['move'],
          costClass: 'state',
          weight: literal(1),
          value: {
            kind: 'adjacentTokenAgg',
            anchorZone: 'alpha:none',
            tokenFilter: { type: 'unit', props: { faction: { eq: 'NVA' } } },
            prop: 'strength',
            aggOp: 'max',
          },
          dependencies: emptyDeps,
        },
        alphaCount: {
          scopes: ['move'],
          costClass: 'state',
          weight: literal(1),
          value: {
            kind: 'zoneTokenAgg',
            zone: 'alpha',
            owner: 'none',
            prop: 'strength',
            aggOp: 'count',
          },
          dependencies: emptyDeps,
        },
      },
      tieBreakers: {
        stable: { kind: 'stableMoveKey', costClass: 'state', dependencies: emptyDeps },
      },
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'encoded-policy-runtime-profile',
        params: {},
        preview: { mode: 'disabled' },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: [],
          considerations: ['boardStrength', 'adjacentThreat', 'alphaCount'],
          tieBreakers: ['stable'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
          considerations: ['boardStrength', 'adjacentThreat', 'alphaCount'],
        },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });
}

function createDef(): GameDef {
  const catalog = createCatalog();
  return {
    metadata: { id: 'encoded-policy-runtime-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      {
        id: asZoneId('alpha:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        zoneKind: 'board',
        adjacentTo: [{ to: asZoneId('bravo:none'), direction: 'bidirectional' }],
      },
      {
        id: asZoneId('bravo:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        zoneKind: 'board',
      },
    ],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [{ id: 'unit', props: { strength: 'int', faction: 'string', elite: 'boolean' } }],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [
      {
        id: actionId,
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

const moves: readonly Move[] = [
  { actionId, params: { choice: 'a' } },
  { actionId, params: { choice: 'b' } },
];

function evaluate(encodedStateMode: 'enabled' | 'disabled') {
  const def = createDef();
  const base = initialState(def, 149006, def.metadata.players.max).state;
  const state = {
    ...base,
    zones: {
      ...base.zones,
      'alpha:none': [
        { id: asTokenId('us-elite'), type: 'unit', props: { strength: 3, faction: 'US', elite: true } },
        { id: asTokenId('us-regular'), type: 'unit', props: { strength: 2, faction: 'US', elite: false } },
        { id: asTokenId('us-missing-strength'), type: 'unit', props: { faction: 'US', elite: true } },
      ],
      'bravo:none': [
        { id: asTokenId('nva-elite'), type: 'unit', props: { strength: 7, faction: 'NVA', elite: true } },
      ],
    },
  };
  const trustedMoveIndex = new Map(
    moves.map((move) => [
      toMoveIdentityKey(def, move),
      createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
    ]),
  );

  return evaluatePolicyMoveCore({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves: moves,
    trustedMoveIndex,
    rng: { state: state.rng },
    encodedStateMode,
  });
}

describe('encoded policy runtime reads', () => {
  it('keeps policy scores identical with and without encoded token aggregate reads', () => {
    const encoded = evaluate('enabled');
    const objectWalk = evaluate('disabled');

    assert.equal(encoded.kind, 'success');
    assert.equal(objectWalk.kind, 'success');
    assert.equal(encoded.metadata.finalScore, objectWalk.metadata.finalScore);
    assert.deepEqual(
      encoded.metadata.candidates.map((candidate) => candidate.scoreContributions),
      objectWalk.metadata.candidates.map((candidate) => candidate.scoreContributions),
    );
    assert.equal(encoded.metadata.finalScore, 12);
  });

  it('routes preloaded production score rows through WASM for supported batches', () => {
    let batchCalls = 0;
    const fakeRuntime: PolicyWasmRuntime = {
      evaluateSmokeAdd: () => 0,
      evaluatePolicyBytecode: () => undefined,
      evaluatePolicyBytecodeBatch: (_bytecode, _encoded, _context, candidates) => {
        batchCalls += 1;
        return candidates.map(() => 1);
      },
      evaluatePreviewDriveBatch: () => ({ kind: 'supported', profileId: 'baseline', rows: [] }),
    };

    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(fakeRuntime);
    try {
      const result = evaluate('enabled');
      assert.equal(result.kind, 'success');
      assert.ok(batchCalls > 0, 'production policy evaluation should call the preloaded WASM score-row runtime');
      assert.equal(result.metadata.finalScore, 3);
    } finally {
      policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
    }
  });

  it('fails closed with production diagnostics when preloaded WASM cannot score the batch', () => {
    const fakeRuntime: PolicyWasmRuntime = {
      evaluateSmokeAdd: () => 0,
      evaluatePolicyBytecode: () => undefined,
      evaluatePolicyBytecodeBatch: () => {
        throw new Error('Policy WASM bytecode batch evaluation failed with status -14.');
      },
      evaluatePreviewDriveBatch: () => ({ kind: 'supported', profileId: 'baseline', rows: [] }),
    };

    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(fakeRuntime);
    try {
      const result = evaluate('enabled');
      assert.equal(result.kind, 'failure');
      assert.equal(result.failure.code, 'RUNTIME_EVALUATION_ERROR');
      assert.match(result.failure.message, /Policy WASM score-row route failed closed/u);
      assert.deepEqual(result.failure.detail, {
        route: 'wasmScoreRows',
        profileId: 'baseline',
        seatId: 'alpha',
        candidateCount: 2,
        considerationCount: 3,
        unsupportedRowClass: 'unsupported value expression for consideration boardStrength',
      });
    } finally {
      policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
    }
  });
});
