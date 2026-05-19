// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import { dispatchGuardrails } from '../../../src/agents/policy-guardrail-eval.js';
import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import {
  asActionId,
  asPlayerId,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledPolicyExpr,
  type GameDef,
  type GuardrailDef,
} from '../../../src/kernel/index.js';
import {
  createCandidate,
  createInitialStrategyModuleState,
  createStrategyModuleGameDef,
  emptyDependencies,
  literal,
} from './strategy-module-test-fixtures.js';

const dependencies = { ...emptyDependencies, guardrails: [] };

const candidateTagRef = (tagName: string): CompiledPolicyExpr => ({
  kind: 'ref',
  ref: { kind: 'candidateTag', tagName },
});

const previewDriveDepthRef = (): CompiledPolicyExpr => ({
  kind: 'ref',
  ref: { kind: 'previewOptionRef', refKind: 'driveDepth' },
});

const guardrailRef = (field: Extract<CompiledPolicyExpr, { readonly kind: 'ref' }>['ref']): CompiledPolicyExpr => ({
  kind: 'ref',
  ref: field,
});

const boolToNumber = (expr: CompiledPolicyExpr): CompiledPolicyExpr => ({
  kind: 'op',
  op: 'boolToNumber',
  args: [expr],
});

function createGuardrail(overrides: Partial<GuardrailDef> = {}): GuardrailDef {
  return {
    id: 'badGuardrail' as GuardrailDef['id'],
    traceLabel: 'bad guardrail',
    scopes: ['move'],
    when: candidateTagRef('bad'),
    severity: 'warn',
    onUnavailable: 'noFire',
    costClass: 'candidate',
    dependencies,
    ...overrides,
  };
}

function withGuardrail(
  base: GameDef,
  guardrail: GuardrailDef,
  profileOverrides: Partial<CompiledAgentProfile> = {},
  catalogOverrides: Partial<AgentPolicyCatalog['compiled']> = {},
): GameDef {
  const catalog = base.agents!;
  const baseProfile = catalog.profiles.baseline!;
  return {
    ...base,
    agents: {
      ...catalog,
      library: {
        ...catalog.library,
        guardrails: {
          ...catalog.library.guardrails,
          [guardrail.id]: {
            traceLabel: guardrail.traceLabel,
            scopes: guardrail.scopes,
            severity: guardrail.severity,
            costClass: guardrail.costClass,
            dependencies: guardrail.dependencies,
            onUnavailable: guardrail.onUnavailable,
            ...(guardrail.safe === undefined ? {} : { safe: guardrail.safe }),
            ...(guardrail.onAllPruned === undefined ? {} : { onAllPruned: guardrail.onAllPruned }),
          },
        },
      },
      compiled: {
        ...catalog.compiled,
        guardrails: {
          ...catalog.compiled.guardrails,
          [guardrail.id]: guardrail,
        },
        ...catalogOverrides,
      },
      profiles: {
        ...catalog.profiles,
        baseline: {
          ...baseProfile,
          use: {
            ...baseProfile.use,
            guardrails: [String(guardrail.id)],
            pruningRules: [],
            considerations: [],
          },
          plan: {
            ...baseProfile.plan,
            considerations: [],
          },
          ...profileOverrides,
        },
      },
    },
  };
}

function withGuardrailRefConsideration(base: GameDef, value: CompiledPolicyExpr): GameDef {
  const catalog = base.agents!;
  const baseProfile = catalog.profiles.baseline!;
  return {
    ...base,
    agents: {
      ...catalog,
      library: {
        ...catalog.library,
        considerations: {
          ...catalog.library.considerations,
          guardrailRefScore: {
            scopes: ['move'],
            costClass: 'state',
            dependencies: { ...emptyDependencies, guardrails: ['badGuardrail'] },
          },
        },
      },
      compiled: {
        ...catalog.compiled,
        considerations: {
          ...catalog.compiled.considerations,
          guardrailRefScore: {
            scopes: ['move'],
            costClass: 'state',
            weight: literal(1),
            value,
            dependencies: { ...emptyDependencies, guardrails: ['badGuardrail'] },
          },
        },
      },
      profiles: {
        ...catalog.profiles,
        baseline: {
          ...baseProfile,
          use: {
            ...baseProfile.use,
            considerations: ['guardrailRefScore'],
          },
          plan: {
            ...baseProfile.plan,
            considerations: ['guardrailRefScore'],
            guardrails: ['badGuardrail'],
          },
        },
      },
    },
  };
}

function evaluate(def: GameDef) {
  const state = createInitialStrategyModuleState(def);
  return evaluatePolicyMoveCore({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves: [
      { actionId: asActionId('badMove'), params: {} },
      { actionId: asActionId('goodMove'), params: {} },
    ],
    trustedMoveIndex: new Map(),
    rng: { state: state.rng },
    diagnosticsMode: 'enabled',
  });
}

describe('guardrail severity dispatch', () => {
  it('prune removes fired candidates before selection', () => {
    const def = withGuardrail(createStrategyModuleGameDef(), createGuardrail({
      severity: 'prune',
      safe: true,
      onAllPruned: { actionId: asActionId('goodMove'), traceLabel: 'fallback' },
    }));

    const result = evaluate(def);

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.move, { actionId: asActionId('goodMove'), params: {} });
    assert.deepEqual(result.metadata.candidates.find((candidate) => candidate.actionId === 'badMove')?.prunedBy, ['badGuardrail']);
    assert.deepEqual(result.metadata.guardrails?.fired, [{
      id: 'badGuardrail',
      traceLabel: 'bad guardrail',
      severity: 'prune',
      status: 'ready',
    }]);
  });

  it('demote subtracts its penalty from fired candidate scores', () => {
    const def = withGuardrail(createStrategyModuleGameDef(), createGuardrail({
      severity: 'demote',
      penalty: literal(20),
    }));

    const result = evaluate(def);

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.move, { actionId: asActionId('goodMove'), params: {} });
    assert.equal(result.metadata.candidates.find((candidate) => candidate.actionId === 'badMove')?.score, -20);
    assert.deepEqual(result.metadata.guardrails?.fired, [{
      id: 'badGuardrail',
      traceLabel: 'bad guardrail',
      severity: 'demote',
      penalty: 20,
      status: 'ready',
    }]);
  });

  it('resolves downstream guardrail refs from dispatch results', () => {
    const def = withGuardrailRefConsideration(
      withGuardrail(createStrategyModuleGameDef(), createGuardrail({
        severity: 'demote',
        penalty: literal(20),
      })),
      {
        kind: 'op',
        op: 'add',
        args: [
          boolToNumber(guardrailRef({ kind: 'guardrail', guardrailId: 'badGuardrail', field: 'fired' })),
          guardrailRef({ kind: 'guardrail', guardrailId: 'badGuardrail', field: 'penalty' }),
        ],
      },
    );

    const result = evaluate(def);

    assert.equal(result.kind, 'success');
    assert.equal(result.metadata.candidates.find((candidate) => candidate.actionId === 'badMove')?.score, 1);
    assert.equal(result.metadata.candidates.find((candidate) => candidate.actionId === 'goodMove')?.score, 0);
  });

  it('resolves guardrail ref fallback provenance without re-running predicates', () => {
    const guardrail = createGuardrail({
      when: previewDriveDepthRef(),
      severity: 'warn',
      onUnavailable: 'warnUnknown',
    });
    const def = withGuardrail(createStrategyModuleGameDef(), guardrail);
    const state = createInitialStrategyModuleState(def);
    const candidate = { ...createCandidate('badMove', 0), prunedBy: [] };
    const context = new PolicyEvaluationContext({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog: def.agents!,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      previewOption: {
        resolvedRefs: new Map([['preview.option.driveDepth', { kind: 'unavailable', reason: 'hidden' }]]),
      },
    }, [candidate]);

    try {
      const dispatch = dispatchGuardrails({
        profile: def.agents!.profiles.baseline!,
        catalog: def.agents!,
        evaluation: context,
        activeCandidates: [candidate],
        collectDiagnostics: true,
      });
      context.setCurrentGuardrailRefView(dispatch.refView);
      const onUnavailableRef = guardrailRef({ kind: 'guardrail', guardrailId: 'badGuardrail', field: 'onUnavailable' });
      const statusRef = guardrailRef({ kind: 'guardrail', guardrailId: 'badGuardrail', field: 'status' });

      assert.equal(context.evaluateCompiledExpr({
        kind: 'op',
        op: 'eq',
        args: [onUnavailableRef, literal('warnUnknown')],
      }, candidate), true);
      assert.equal(context.evaluateCompiledExpr({
        kind: 'op',
        op: 'eq',
        args: [statusRef, literal('unavailable')],
      }, candidate), true);
      assert.equal(context.getEvaluatedGuardrailWhenCacheSize(), 1);
    } finally {
      context.dispose();
    }
  });

  it('warn and auditOnly record trace markers without changing scores', () => {
    for (const severity of ['warn', 'auditOnly'] as const) {
      const def = withGuardrail(createStrategyModuleGameDef(), createGuardrail({ severity }));

      const result = evaluate(def);

      assert.equal(result.kind, 'success');
      assert.equal(result.metadata.candidates.find((candidate) => candidate.actionId === 'badMove')?.score, 0);
      assert.deepEqual(result.metadata.guardrails?.fired, [{
        id: 'badGuardrail',
        traceLabel: 'bad guardrail',
        severity,
        status: 'ready',
      }]);
    }
  });

  it('caches a state-scoped guardrail condition once per decision', () => {
    const guardrail = createGuardrail({
      when: literal(true),
      costClass: 'state',
      severity: 'warn',
    });
    const def = withGuardrail(createStrategyModuleGameDef(), guardrail);
    const state = createInitialStrategyModuleState(def);
    const context = new PolicyEvaluationContext({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog: def.agents!,
      parameterValues: {},
      trustedMoveIndex: new Map(),
    }, [
      ...Array.from({ length: 20 }, (_entry, index) => createCandidate('goodMove', index)),
      createCandidate('badMove', 20),
    ]);

    try {
      for (let i = 0; i < 20; i += 1) {
        assert.equal(context.evaluateGuardrailWhen('badGuardrail'), true);
      }
      assert.equal(context.getEvaluatedGuardrailWhenCacheSize(), 1);
    } finally {
      context.dispose();
    }
  });

  it('records declared preview-unavailable fallback mode in guardrail traces', () => {
    for (const onUnavailable of ['noFire', 'warnUnknown', 'fire'] as const) {
      const guardrail = createGuardrail({
        when: previewDriveDepthRef(),
        severity: 'warn',
        onUnavailable,
      });
      const def = withGuardrail(createStrategyModuleGameDef(), guardrail);
      const state = createInitialStrategyModuleState(def);
      const candidate = { ...createCandidate('badMove', 0), prunedBy: [] };
      const context = new PolicyEvaluationContext({
        def,
        state,
        playerId: asPlayerId(0),
        seatId: 'alpha',
        catalog: def.agents!,
        parameterValues: {},
        trustedMoveIndex: new Map(),
        previewOption: {
          resolvedRefs: new Map([['preview.option.driveDepth', { kind: 'unavailable', reason: 'hidden' }]]),
        },
      }, [candidate]);

      try {
        const result = dispatchGuardrails({
          profile: def.agents!.profiles.baseline!,
          catalog: def.agents!,
          evaluation: context,
          activeCandidates: [candidate],
          collectDiagnostics: true,
        });

        if (onUnavailable === 'fire') {
          assert.deepEqual(result.trace?.fired, [{
            id: 'badGuardrail',
            traceLabel: 'bad guardrail',
            severity: 'warn',
            status: 'unavailable',
            onUnavailable,
          }]);
          assert.deepEqual(result.trace?.notFiredTop, []);
        } else {
          assert.deepEqual(result.trace?.fired, []);
          assert.deepEqual(result.trace?.notFiredTop, [{
            id: 'badGuardrail',
            reason: 'previewUnavailable',
            onUnavailable,
          }]);
        }
      } finally {
        context.dispose();
      }
    }
  });

  it('produces byte-identical decisions for repeated guardrail profile evaluation', () => {
    const def = withGuardrail(createStrategyModuleGameDef(), createGuardrail({
      severity: 'demote',
      penalty: literal(5),
    }));

    const first = evaluate(def);
    const second = evaluate(def);

    assert.equal(first.kind, 'success');
    assert.equal(second.kind, 'success');
    assert.equal(JSON.stringify(first.move), JSON.stringify(second.move));
    assert.equal(JSON.stringify(first.metadata), JSON.stringify(second.metadata));
  });
});
