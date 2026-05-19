// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { CnlCompilerDiagnosticCode } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(
  strategyModules: Record<string, unknown>,
  extraLibrary: Record<string, unknown> = {},
  extraProfile: Record<string, unknown> = {},
): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agent-module-diagnostics-test', players: { min: 2, max: 2 } },
    observability: { observers: { testObserver: { surfaces: { victory: { currentMargin: 'public' } } } } },
    zones: [{ id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{
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
    }],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [{ seat: 'p1', value: 0 }, { seat: 'p2', value: 0 }],
      ranking: { order: 'desc' },
    },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'p1' }, { id: 'p2' }] } }],
    agents: {
      library: {
        selectors: { zonePriority: validSelector() },
        strategyModules: strategyModules as any,
        considerations: { useModule: { scopes: ['move'], weight: 1, value: { ref: 'module.good.contribution' } } },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        ...extraLibrary,
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: { considerations: ['useModule'], guardrails: [], tieBreakers: ['stableMoveKey'] },
          ...extraProfile,
        },
      },
      bindings: { p1: 'baseline' },
    },
  };
}

function validSelector(overrides: Record<string, unknown> = {}): any {
  return {
    scopes: ['move'],
    source: { collection: { kind: 'zones' } },
    quality: { components: [{ id: 'constant', value: 1, weight: 1 }], order: 'qualityDesc' },
    result: { maxItems: 4, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    ...overrides,
  };
}

function validModule(overrides: Record<string, unknown> = {}): any {
  return {
    traceLabel: 'good module',
    when: true,
    applies: { scopes: ['move'] },
    priority: { tier: 10 },
    selectors: [{ role: 'primaryTarget', selectorId: 'zonePriority' }],
    scoreGroups: [{ id: 'targetQuality', summary: 'sum', terms: [{ id: 'constant', value: 1, weight: 1 }] }],
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

describe('agent strategy module diagnostics', () => {
  it('reports unknown refs and duplicate score group ids', () => {
    assertCode(
      createDoc({ good: validModule({ selectors: [{ role: 'primaryTarget', selectorId: 'missing' }] }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN,
    );
    assertCode(
      createDoc({ good: validModule({
        scoreGroups: [
          { id: 'dup', summary: 'sum', terms: [{ value: 1, weight: 1 }] },
          { id: 'dup', summary: 'sum', terms: [{ value: 1, weight: 1 }] },
        ],
      }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_SCORE_GROUP_DUPLICATE_ID,
    );
  });

  it('reports priority, selector role, guardrail, and fallback diagnostics', () => {
    assertCode(
      createDoc({ good: validModule({ priority: { tier: 101 } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_PRIORITY_TIER_OUT_OF_RANGE,
    );
    assertCode(
      createDoc({ good: validModule({
        selectors: [
          { role: 'primaryTarget', selectorId: 'zonePriority' },
          { role: 'primaryTarget', selectorId: 'zonePriority' },
        ],
      }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_SELECTOR_ROLE_DUPLICATE,
    );
    assertCode(
      createDoc({ good: validModule({ guardrailIds: ['pruneUnsafe'] }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN,
    );
    assertCode(
      createDoc({ good: validModule({ fallback: { ifInactive: 'noContribution', ifSelectorEmpty: 'demoteAndTrace' } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_FALLBACK_DEMOTE_REQUIRES_PENALTY,
    );
  });

  it('reports dependency cycle, cost class, and trace label diagnostics', () => {
    assertCode(
      createDoc({ good: validModule({
        scoreGroups: [{ id: 'self', summary: 'sum', terms: [{ value: { ref: 'module.good.contribution' }, weight: 1 }] }],
      }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_DEPENDENCY_CYCLE,
    );
    assertCode(
      createDoc(
        { good: validModule({
          scoreGroups: [{
            id: 'preview',
            summary: 'sum',
            terms: [{ value: { coalesce: [{ ref: 'preview.option.victory.currentMargin.self' }, 0] }, weight: 1 }],
          }],
        }) },
        {},
        { strategyModules: { maxCostClass: 'state' } },
      ),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_COST_CLASS_EXCEEDS_LIMIT,
    );
    assertCode(
      createDoc({
        good: validModule(),
        duplicate: validModule({ traceLabel: 'good module' }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_MODULE_TRACE_LABEL_DUPLICATE,
    );
  });
});
