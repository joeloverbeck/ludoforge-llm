// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { CnlCompilerDiagnosticCode } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(
  guardrails: Record<string, unknown>,
  extraLibrary: Record<string, unknown> = {},
  extraProfile: Record<string, unknown> = {},
): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agent-guardrail-diagnostics-test', players: { min: 2, max: 2 } },
    observability: { observers: { testObserver: { surfaces: { victory: { currentMargin: 'public' } } } } },
    zones: [{ id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'pass',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
        tags: ['pass'],
      },
      {
        id: 'not-pass',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [{ seat: 'p1', value: 0 }, { seat: 'p2', value: 0 }],
      ranking: { order: 'desc' },
    },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'p1' }, { id: 'p2' }] } }],
    agents: {
      library: {
        guardrails: guardrails as any,
        considerations: { stable: { scopes: ['move'], weight: 1, value: 1 } },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        ...extraLibrary,
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: { considerations: ['stable'], guardrails: [], tieBreakers: ['stableMoveKey'] },
          ...extraProfile,
        },
      },
      bindings: { p1: 'baseline' },
    },
  };
}

function validGuardrail(overrides: Record<string, unknown> = {}): any {
  return {
    traceLabel: 'good guardrail',
    scopes: ['move'],
    when: true,
    severity: 'warn',
    onUnavailable: 'noFire',
    ...overrides,
  };
}

function validSelector(): any {
  return {
    scopes: ['move'],
    source: { collection: { kind: 'zones' } },
    quality: { components: [{ id: 'constant', value: 1, weight: 1 }], order: 'qualityDesc' },
    result: { maxItems: 4, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
  };
}

function validModule(overrides: Record<string, unknown> = {}): any {
  return {
    traceLabel: 'module',
    when: true,
    applies: { scopes: ['move'] },
    priority: { tier: 10 },
    selectors: [{ role: 'primaryTarget', selectorId: 'zonePriority' }],
    scoreGroups: [{ id: 'constant', summary: 'sum', terms: [{ value: 1, weight: 1 }] }],
    fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'noContribution' },
    ...overrides,
  };
}

function assertCode(doc: GameSpecDoc, code: CnlCompilerDiagnosticCode): void {
  const result = compileGameSpecToGameDef(doc);
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.code === code),
    true,
    `expected ${code}; got ${result.diagnostics.map((diagnostic) => diagnostic.code).join(', ')}`,
  );
}

const deprecatedGuardrailKey = 'pruning' + 'Rules';

describe('agent guardrail diagnostics', () => {
  it('reports deprecated guardrail predecessor declarations', () => {
    assertCode(
      createDoc({}, { [deprecatedGuardrailKey]: { oldRule: { when: true } } }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED,
    );
    assertCode(
      createDoc({}, {}, { use: { [deprecatedGuardrailKey]: ['oldRule'], considerations: ['stable'], tieBreakers: ['stableMoveKey'] } }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED,
    );
  });

  it('compiles downstream guardrail refs and tracks guardrail dependencies', () => {
    const result = compileGameSpecToGameDef(createDoc(
      { good: validGuardrail({ severity: 'demote', penalty: 7 }) },
      {
        considerations: {
          stable: {
            scopes: ['move'],
            weight: 1,
            value: { add: [{ boolToNumber: { ref: 'guardrail.good.fired' } }, { ref: 'guardrail.good.penalty' }] },
          },
        },
      },
    ));

    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.deepEqual(result.gameDef?.agents?.library.considerations?.stable?.dependencies.guardrails, ['good']);
    assert.deepEqual(result.gameDef?.agents?.compiled.considerations.stable?.value, {
      kind: 'op',
      op: 'add',
      args: [
        {
          kind: 'op',
          op: 'boolToNumber',
          args: [{ kind: 'ref', ref: { kind: 'guardrail', guardrailId: 'good', field: 'fired' } }],
        },
        { kind: 'ref', ref: { kind: 'guardrail', guardrailId: 'good', field: 'penalty' } },
      ],
    });
  });

  it('reports unknown refs and demote penalty requirements', () => {
    assertCode(
      createDoc({ bad: validGuardrail({ when: { ref: 'module.missing.active' } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN,
    );
    assertCode(
      createDoc(
        { good: validGuardrail() },
        { considerations: { stable: { scopes: ['move'], weight: 1, value: { ref: 'guardrail.missing.fired' } } } },
      ),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN,
    );
    assertCode(
      createDoc(
        { good: validGuardrail() },
        { considerations: { stable: { scopes: ['move'], weight: 1, value: { ref: 'guardrail.good.unknown' } } } },
      ),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN,
    );
    assertCode(
      createDoc({ bad: validGuardrail({ severity: 'demote' }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_DEMOTE_REQUIRES_PENALTY,
    );
  });

  it('reports prune safety, fallback, and pass-tag diagnostics', () => {
    assertCode(
      createDoc({ bad: validGuardrail({ severity: 'prune', onAllPruned: { actionId: 'pass' } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_PRUNE_REQUIRES_SAFE,
    );
    assertCode(
      createDoc({ bad: validGuardrail({ severity: 'prune', safe: true }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_PRUNE_REQUIRES_ON_ALL_PRUNED,
    );
    assertCode(
      createDoc({ bad: validGuardrail({ severity: 'prune', safe: true, onAllPruned: { actionId: 'not-pass' } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_ON_ALL_PRUNED_ACTION_NOT_PASS_TAGGED,
    );
  });

  it('reports preview fallback and cost-class diagnostics', () => {
    const previewGuardrail = validGuardrail({
      when: { gt: [{ coalesce: [{ ref: 'preview.option.victory.currentMargin.self' }, 0] }, 0] },
      onUnavailable: undefined,
    });
    assertCode(
      createDoc({ bad: previewGuardrail }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_PREVIEW_REQUIRES_FALLBACK,
    );
    assertCode(
      createDoc(
        { preview: validGuardrail({ ...previewGuardrail, onUnavailable: 'noFire' }) },
        {
          selectors: { zonePriority: validSelector() },
          strategyModules: { useGuardrail: validModule({ guardrailIds: ['preview'] }) },
        },
        { use: { strategyModules: ['useGuardrail'], considerations: ['stable'], guardrails: [], tieBreakers: ['stableMoveKey'] }, guardrails: { maxCostClass: 'state' } },
      ),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_COST_CLASS_EXCEEDS_LIMIT,
    );
  });

  it('reports dependency cycles and duplicate trace labels', () => {
    assertCode(
      createDoc(
        { bad: validGuardrail({ when: { ref: 'module.loop.active' } }) },
        {
          selectors: { zonePriority: validSelector() },
          strategyModules: { loop: validModule({ guardrailIds: ['bad'] }) },
        },
      ),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_DEPENDENCY_CYCLE,
    );
    assertCode(
      createDoc({
        first: validGuardrail(),
        second: validGuardrail({ traceLabel: 'good guardrail' }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_GUARDRAIL_TRACE_LABEL_DUPLICATE,
    );
  });
});
