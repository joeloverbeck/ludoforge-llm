// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateSelector } from '../../../src/agents/policy-selector-eval.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecAgentLibrary, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';
import type { CompiledPolicySelector, GameDef, GameState } from '../../../src/kernel/index.js';

type SelectorLibrary = NonNullable<GameSpecAgentLibrary['selectors']>;

function createDoc(selectors: SelectorLibrary): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'role-selector-routepairs-subset-test', players: { min: 2, max: 2 } },
    zones: [
      { id: 'alpha', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: 'beta', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: 'gamma', owner: 'none', visibility: 'public', ordering: 'set' },
    ],
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
    agents: {
      library: {
        selectors,
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          params: {},
          use: { guardrails: [], tieBreakers: ['stableMoveKey'] },
        },
      },
      bindings: { p1: 'baseline' },
    },
  };
}

function zoneSelector(maxItems = 3): SelectorLibrary[string] {
  return {
    scopes: ['move'],
    source: { collection: { kind: 'zones' } },
    quality: {
      components: [{ id: 'constant', value: 1, weight: 1 }],
      order: 'qualityDesc',
    },
    result: { maxItems, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
  };
}

function compileSelectors(selectors: SelectorLibrary): Record<string, CompiledPolicySelector> {
  const result = compileGameSpecToGameDef(createDoc(selectors));
  assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
  return result.gameDef?.agents?.compiled.selectors ?? {};
}

function state(): GameState {
  return {
    zones: { beta: [], alpha: [], gamma: [] },
    playerCount: 2,
  } as unknown as GameState;
}

function evaluate(
  selector: CompiledPolicySelector,
  selectors: Record<string, CompiledPolicySelector>,
) {
  return evaluateSelector(selector, {
    def: {} as GameDef,
    state: state(),
    candidates: [],
    selectors,
    evaluateExpr: (expr) => expr.kind === 'literal' ? expr.value as number | boolean : undefined,
  });
}

describe('routePairs and subset role selector sources', () => {
  it('compiles and deterministically enumerates capped routePairs from selector outputs', () => {
    const selectors = compileSelectors({
      originRank: zoneSelector(2),
      destinationRank: zoneSelector(2),
      routeChoices: {
        scopes: ['move'],
        source: { kind: 'routePairs', origin: 'originRank', destination: 'destinationRank', maxPairs: 3 },
        quality: {
          components: [{ id: 'pair', value: 1, weight: 2 }],
          order: 'qualityDesc',
        },
        result: { maxItems: 3, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
      },
    });

    assert.deepEqual(selectors.routeChoices?.source, {
      kind: 'routePairs',
      originSelectorId: 'originRank',
      destinationSelectorId: 'destinationRank',
      maxPairs: 3,
    });

    const first = evaluate(selectors.routeChoices!, selectors);
    const second = evaluate(selectors.routeChoices!, selectors);
    assert.deepEqual(first.selected.map((item) => item.key), ['alpha|alpha', 'alpha|beta', 'beta|alpha']);
    assert.deepEqual(first, second);
  });

  it('compiles and deterministically enumerates bounded subsets from selector outputs', () => {
    const selectors = compileSelectors({
      zoneRank: zoneSelector(3),
      subsetChoices: {
        scopes: ['move'],
        source: { kind: 'subset', of: { kind: 'selector', selector: 'zoneRank' }, min: 2, max: 2, beamWidth: 2 },
        quality: {
          components: [{ id: 'subset', value: 1, weight: 3 }],
          order: 'qualityDesc',
        },
        result: { maxItems: 2, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
      },
    });

    assert.deepEqual(selectors.subsetChoices?.source, {
      kind: 'subset',
      of: { kind: 'selector', selectorId: 'zoneRank' },
      min: 2,
      max: 2,
      beamWidth: 2,
    });

    const view = evaluate(selectors.subsetChoices!, selectors);
    assert.deepEqual(view.selected.map((item) => item.key), ['alpha|beta', 'alpha|gamma']);
  });

  it('reports named cap diagnostics when routePairs or subset bounds are absent', () => {
    const result = compileGameSpecToGameDef(createDoc({
      originRank: zoneSelector(2),
      destinationRank: zoneSelector(2),
      routeChoices: {
        scopes: ['move'],
        source: { kind: 'routePairs', origin: 'originRank', destination: 'destinationRank' },
        result: { maxItems: 1, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
      },
      subsetChoices: {
        scopes: ['move'],
        source: { kind: 'subset', of: { collection: { kind: 'zones' } } },
        result: { maxItems: 1, order: ['stableKeyAsc'], onEmpty: 'noContribution' },
      },
    }));

    const messages = result.diagnostics.map((diagnostic) => diagnostic.message);
    assert.ok(messages.includes('routePairs selector source requires maxPairs.'));
    assert.ok(messages.includes('subset selector source requires min, max, and beamWidth.'));
  });
});
