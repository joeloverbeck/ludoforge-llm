// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agent-selector-ir-test', players: { min: 2, max: 2 } },
    observability: {
      observers: {
        testObserver: {
          surfaces: { victory: { currentMargin: 'public' } },
        },
      },
    },
    zones: [{ id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set', attributes: { population: 1 } }],
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
    dataAssets: [{
      id: 'seats',
      kind: 'seatCatalog',
      payload: { seats: [{ id: 'p1' }, { id: 'p2' }] },
    }],
  };
}

function selector(overrides: Record<string, unknown> = {}): any {
  return {
    scopes: ['move'],
    source: { collection: { kind: 'zones' } },
    quality: {
      components: [{ id: 'constant', value: 1, weight: 1 }],
      order: 'qualityDesc',
    },
    result: { maxItems: 4, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
    ...overrides,
  };
}

describe('agent selector IR compilation', () => {
  it('compiles a selector bucket entry into policy and agent catalog metadata', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          selectors: {
            zonePriority: selector(),
          },
          considerations: {
            preferSelector: {
              scopes: ['move'],
              weight: 1,
              value: { ref: 'selector.zonePriority.selected.quality' },
            },
          },
          tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        },
        profiles: {
          baseline: {
            observer: 'testObserver',
            params: {},
            use: {
              considerations: ['preferSelector'],
              pruningRules: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: { p1: 'baseline' },
      },
    });

    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    const compiled = result.gameDef?.agents?.compiled.selectors?.zonePriority;
    assert.equal(compiled?.costClass, 'state');
    assert.equal(compiled?.result.maxItems, 4);
    assert.deepEqual(result.gameDef?.agents?.library.selectors?.zonePriority?.dependencies.selectors ?? [], []);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.plan.selectors, ['zonePriority']);
    assert.deepEqual(result.gameDef?.agents?.selectorCaps, { maxResultItems: 32, maxProductPairs: 256 });
  });

  it('derives state, candidate, microturn, and preview cost classes', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          selectors: {
            stateSelector: selector(),
            candidateSelector: selector({
              quality: {
                components: [{ id: 'candidate-tag', value: { boolToNumber: { ref: 'candidate.tag.pass' } }, weight: 1 }],
                order: 'qualityDesc',
              },
            }),
            microturnSelector: selector({ scopes: ['microturn'], source: { kind: 'microturnOptions' } }),
            previewSelector: selector({
              quality: {
                components: [{
                  id: 'margin',
                  value: { coalesce: [{ ref: 'preview.option.victory.currentMargin.self' }, 0] },
                  weight: 1,
                  previewFallback: { onUnavailable: 'noContribution' },
                }],
                order: 'qualityDesc',
              },
            }),
          },
          considerations: {
            useStateSelector: { scopes: ['move'], weight: 1, value: { ref: 'selector.stateSelector.selected.quality' } },
            useCurrentSelector: { scopes: ['microturn'], weight: 1, value: { ref: 'selector.microturnSelector.current.quality' } },
          },
          tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        },
        profiles: {
          baseline: {
            observer: 'testObserver',
            params: {},
            use: { considerations: ['useStateSelector', 'useCurrentSelector'], pruningRules: [], tieBreakers: ['stableMoveKey'] },
          },
        },
        bindings: { p1: 'baseline' },
      },
    });

    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    const selectors = result.gameDef?.agents?.compiled.selectors;
    assert.equal(selectors?.stateSelector?.costClass, 'state');
    assert.equal(selectors?.candidateSelector?.costClass, 'candidate');
    assert.equal(selectors?.microturnSelector?.costClass, 'microturn');
    assert.equal(selectors?.previewSelector?.costClass, 'preview');
    assert.deepEqual(result.gameDef?.agents?.library.considerations?.useCurrentSelector?.dependencies.selectors, ['microturnSelector']);
  });

  it('reports selector dependency cycles with the selector-specific diagnostic', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          selectors: {
            recursive: selector({
              quality: {
                components: [{ id: 'self', value: { ref: 'selector.recursive.selected.quality' }, weight: 1 }],
                order: 'qualityDesc',
              },
            }),
          },
        },
        profiles: {},
        bindings: {},
      },
    });

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_SELECTOR_DEPENDENCY_CYCLE),
      true,
    );
  });
});
