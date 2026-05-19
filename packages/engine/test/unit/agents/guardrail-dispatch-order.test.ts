// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import {
  asActionId,
  asPlayerId,
  type CompiledPolicyExpr,
  type GuardrailDef,
} from '../../../src/kernel/index.js';
import {
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

describe('guardrail dispatch order', () => {
  it('runs guardrails after modules and before pruningRules', () => {
    const base = createStrategyModuleGameDef();
    const catalog = base.agents!;
    const guardrail: GuardrailDef = {
      id: 'dropBad' as GuardrailDef['id'],
      traceLabel: 'drop bad',
      scopes: ['move'],
      when: candidateTagRef('bad'),
      severity: 'prune',
      safe: true,
      onAllPruned: { actionId: asActionId('goodMove'), traceLabel: 'fallback' },
      onUnavailable: 'noFire',
      costClass: 'candidate',
      dependencies,
    };
    const countActiveCandidates: CompiledPolicyExpr = {
      kind: 'ref',
      ref: { kind: 'library', refKind: 'aggregate', id: 'activeCandidateCount' },
    };
    const pruneGoodOnlyAfterGuardrail: CompiledPolicyExpr = {
      kind: 'op',
      op: 'and',
      args: [
        candidateTagRef('good'),
        { kind: 'op', op: 'eq', args: [countActiveCandidates, literal(1)] },
      ],
    };
    const def = {
      ...base,
      agents: {
        ...catalog,
        library: {
          ...catalog.library,
          guardrails: {
            dropBad: {
              traceLabel: guardrail.traceLabel,
              scopes: guardrail.scopes,
              severity: guardrail.severity,
              costClass: guardrail.costClass,
              dependencies: guardrail.dependencies,
              safe: true as const,
              onUnavailable: guardrail.onUnavailable,
              ...(guardrail.onAllPruned === undefined ? {} : { onAllPruned: guardrail.onAllPruned }),
            },
          },
        },
        compiled: {
          ...catalog.compiled,
          guardrails: { dropBad: guardrail },
          candidateAggregates: {
            ...catalog.compiled.candidateAggregates,
            activeCandidateCount: {
              type: 'number' as const,
              costClass: 'state' as const,
              op: 'count' as const,
              of: literal(1),
              dependencies,
            },
          },
          pruningRules: {
            afterGuardrail: {
              costClass: 'candidate' as const,
              when: pruneGoodOnlyAfterGuardrail,
              dependencies,
              onEmpty: 'error' as const,
            },
          },
        },
        profiles: {
          ...catalog.profiles,
          baseline: {
            ...catalog.profiles.baseline!,
            use: {
              ...catalog.profiles.baseline!.use,
              guardrails: ['dropBad'],
              pruningRules: ['afterGuardrail'],
              considerations: [],
            },
            plan: {
              ...catalog.profiles.baseline!.plan,
              considerations: [],
            },
          },
        },
      },
    };
    const state = createInitialStrategyModuleState(def);

    const result = evaluatePolicyMoveCore({
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

    assert.equal(result.kind, 'failure');
    assert.equal(result.failure.code, 'PRUNING_RULE_EMPTIED_CANDIDATES');
    assert.deepEqual(result.metadata.candidates.find((candidate) => candidate.actionId === 'badMove')?.prunedBy, ['dropBad']);
  });
});
