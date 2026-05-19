// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import { asActionId, asPlayerId } from '../../../src/kernel/index.js';
import {
  createInitialStrategyModuleState,
  createStrategyModuleDef,
  createStrategyModuleGameDef,
  emptyDependencies,
  moduleRef,
} from './strategy-module-test-fixtures.js';

describe('strategy module dispatch order', () => {
  it('evaluates modules before pruning and considerations so module refs are readable downstream', () => {
    const def = createStrategyModuleGameDef();
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

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.move, { actionId: asActionId('goodMove'), params: {} });

    const good = result.metadata.candidates.find((candidate) => candidate.actionId === 'goodMove');
    const bad = result.metadata.candidates.find((candidate) => candidate.actionId === 'badMove');
    assert.deepEqual(good?.scoreContributions, [{ termId: 'moduleContribution', contribution: 7 }]);
    assert.deepEqual(bad?.scoreContributions, [{ termId: 'moduleContribution', contribution: 0 }]);
  });

  it('keeps planned module trace visible after pruning invalidates candidate-dependent caches', () => {
    const base = createStrategyModuleGameDef(createStrategyModuleDef({
      applies: { scopes: ['move'], actionTags: ['bad'] },
      costClass: 'candidate',
    }));
    const catalog = base.agents!;
    const def = {
      ...base,
      agents: {
        ...catalog,
        compiled: {
          ...catalog.compiled,
          guardrails: {
            ...(catalog.compiled.guardrails ?? {}),
            dropInactive: {
              ...catalog.compiled.guardrails!.dropInactive!,
              costClass: 'candidate' as const,
              when: {
                kind: 'op',
                op: 'eq',
                args: [
                  moduleRef('buildEngine', { kind: 'strategyModule', moduleId: 'buildEngine', field: 'contribution' }),
                  { kind: 'literal', value: 0 },
                ],
              } as const,
            },
          },
        },
        profiles: {
          ...catalog.profiles,
          baseline: {
            ...catalog.profiles.baseline!,
            use: {
              ...catalog.profiles.baseline!.use,
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

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.move, { actionId: asActionId('badMove'), params: {} });
    assert.deepEqual(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'goodMove')?.prunedBy,
      ['dropInactive'],
    );
    assert.deepEqual(result.metadata.modules?.active, [
      {
        id: 'buildEngine',
        traceLabel: 'build engine',
        priorityTier: 10,
        activationValue: 4,
        contribution: 7,
        scoreGroups: { standing: 7 },
      },
    ]);
  });

  it('resolves module score-group and selector binding refs from downstream considerations', () => {
    const def = createStrategyModuleGameDef();
    const state = createInitialStrategyModuleState(def);
    const catalog = def.agents!;
    const moduleContribution = catalog.compiled.strategyModules?.buildEngine;
    assert.ok(moduleContribution);

    const scoreGroupRef = moduleRef('buildEngine', {
      kind: 'strategyModule',
      moduleId: 'buildEngine',
      field: { kind: 'scoreGroup.value', scoreGroupId: 'standing' },
    });
    const selectorRef = moduleRef('buildEngine', {
      kind: 'strategyModule',
      moduleId: 'buildEngine',
      field: { kind: 'selector.id', role: 'primary' },
    });

    const result = evaluatePolicyMoveCore({
      def: {
        ...def,
        agents: {
          ...catalog,
          compiled: {
            ...catalog.compiled,
            considerations: {
              ...catalog.compiled.considerations,
              scoreGroupValue: {
                scopes: ['move'],
                costClass: 'state',
                weight: { kind: 'literal', value: 1 },
                value: scoreGroupRef,
                dependencies: emptyDependencies,
              },
              selectorIdMatches: {
                scopes: ['move'],
                costClass: 'state',
                weight: { kind: 'literal', value: 3 },
                value: {
                  kind: 'op',
                  op: 'boolToNumber',
                  args: [{
                    kind: 'op',
                    op: 'eq',
                    args: [selectorRef, { kind: 'literal', value: 'zonePriority' }],
                  }],
                },
                dependencies: emptyDependencies,
              },
            },
          },
          profiles: {
            ...catalog.profiles,
            baseline: {
              ...catalog.profiles.baseline!,
              use: {
                ...catalog.profiles.baseline!.use,
                considerations: ['scoreGroupValue', 'selectorIdMatches'],
              },
              plan: {
                ...catalog.profiles.baseline!.plan,
                considerations: ['scoreGroupValue', 'selectorIdMatches'],
              },
            },
          },
        },
      },
      state,
      playerId: asPlayerId(0),
      legalMoves: [{ actionId: asActionId('goodMove'), params: {} }],
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      diagnosticsMode: 'enabled',
    });

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.metadata.candidates[0]?.scoreContributions, [
      { termId: 'scoreGroupValue', contribution: 7 },
      { termId: 'selectorIdMatches', contribution: 3 },
    ]);
  });

  it('produces byte-identical decisions and candidate scores for a module-using profile replay', () => {
    const def = createStrategyModuleGameDef();
    const state = createInitialStrategyModuleState(def);
    const input = {
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: [
        { actionId: asActionId('badMove'), params: {} },
        { actionId: asActionId('goodMove'), params: {} },
      ],
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      diagnosticsMode: 'enabled' as const,
    };

    const first = evaluatePolicyMoveCore(input);
    const second = evaluatePolicyMoveCore(input);

    assert.equal(first.kind, 'success');
    assert.equal(second.kind, 'success');
    assert.deepEqual(first.move, second.move);
    assert.deepEqual(
      first.metadata.candidates.map((candidate) => ({
        key: candidate.stableMoveKey,
        score: candidate.score,
        contributions: candidate.scoreContributions,
      })),
      second.metadata.candidates.map((candidate) => ({
        key: candidate.stableMoveKey,
        score: candidate.score,
        contributions: candidate.scoreContributions,
      })),
    );
  });
});
