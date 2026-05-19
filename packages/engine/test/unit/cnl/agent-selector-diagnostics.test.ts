// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { CnlCompilerDiagnosticCode } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(selectorDef: Record<string, unknown>, extraLibrary: Record<string, unknown> = {}): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agent-selector-diagnostics-test', players: { min: 2, max: 2 } },
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
        selectors: { bad: selectorDef as any },
        ...extraLibrary,
      },
      profiles: {},
      bindings: {},
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

function assertCode(doc: GameSpecDoc, code: CnlCompilerDiagnosticCode): void {
  const result = compileGameSpecToGameDef(doc);
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.code === code),
    true,
    `expected ${code}; got ${result.diagnostics.map((diagnostic) => diagnostic.code).join(', ')}`,
  );
}

describe('agent selector diagnostics', () => {
  it('reports source diagnostics', () => {
    assertCode(
      createDoc(validSelector({ source: { collection: { kind: 'bogus' } } })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN,
    );
    assertCode(
      createDoc(validSelector({ source: { collection: { kind: 'authoredFinite' } } })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_UNKNOWN,
    );
    assertCode(
      createDoc(validSelector({ source: { collection: { kind: 'authoredFinite', collectionId: 'futureSet' } } })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_SOURCE_NOT_FINITE,
    );
    assertCode(
      createDoc(validSelector({ source: { collection: { kind: 'zones' }, key: { from: 12 } } })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_BINDING_TYPE_MISMATCH,
    );
  });

  it('reports product bound diagnostics', () => {
    assertCode(
      createDoc(validSelector({ source: { kind: 'product', left: { kind: 'zones' }, right: { kind: 'zones' } } })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MISSING_MAXPAIRS,
    );
    assertCode(
      createDoc(validSelector({
        source: { kind: 'product', left: { kind: 'zones' }, right: { kind: 'zones' }, maxPairs: 257 },
      })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_PRODUCT_MAXPAIRS_EXCEEDS_CAP,
    );
  });

  it('reports result diagnostics', () => {
    assertCode(
      createDoc(validSelector({ result: { maxItems: 33, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' } })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_MAXITEMS_MISSING_OR_EXCEEDS_CAP,
    );
    assertCode(
      createDoc(validSelector({ result: { maxItems: 4, order: ['qualityDesc', 'stableKeyAsc'] } })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_ONEMPTY_MISSING,
    );
    assertCode(
      createDoc(validSelector({ result: { maxItems: 4, order: ['qualityDesc'], onEmpty: 'noContribution' } })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_COMPONENT_NONDETERMINISTIC_ORDER,
    );
  });

  it('reports preview fallback, unknown selector ref, cycle, and profile cost diagnostics', () => {
    assertCode(
      createDoc(validSelector({
        quality: {
          components: [{ id: 'margin', value: { ref: 'preview.option.victory.currentMargin.self' }, weight: 1 }],
          order: 'qualityDesc',
        },
      })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_COMPONENT_REQUIRES_FALLBACK,
    );

    assertCode(
      createDoc(validSelector(), {
        considerations: { broken: { scopes: ['move'], weight: 1, value: { ref: 'selector.missing.selected.quality' } } },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_REF_UNKNOWN,
    );

    assertCode(
      createDoc(validSelector({
        quality: { components: [{ id: 'self', value: { ref: 'selector.bad.selected.quality' }, weight: 1 }], order: 'qualityDesc' },
      })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_DEPENDENCY_CYCLE,
    );

    const profileCostDoc = createDoc(validSelector({
      quality: { components: [{ id: 'candidate', value: { boolToNumber: { ref: 'candidate.tag.pass' } }, weight: 1 }], order: 'qualityDesc' },
    }), {
      considerations: { useBad: { scopes: ['move'], weight: 1, value: { ref: 'selector.bad.selected.quality' } } },
      tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
    });
    assertCode({
      ...profileCostDoc,
      agents: {
        ...profileCostDoc.agents!,
        profiles: {
          baseline: {
            observer: 'testObserver',
            params: {},
            selector: { maxCostClass: 'state' },
            use: { considerations: ['useBad'], guardrails: [], tieBreakers: ['stableMoveKey'] },
          },
        },
        bindings: { p1: 'baseline' },
      },
    }, CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_COST_CLASS_EXCEEDS_LIMIT);

    assertCode(
      createDoc(validSelector({
        quality: {
          components: [{
            id: 'missingPreview',
            value: { ref: 'preview.option.var.global.unregistered' },
            weight: 1,
            previewFallback: { onUnavailable: 'noContribution' },
          }],
          order: 'qualityDesc',
        },
      })),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_REQUIRES_UNREGISTERED_PREVIEW_REF,
    );
  });
});
