// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecAgentProfileDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const WARNING_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_POLICYGUIDED_NO_MICROTURN_CONSIDERATIONS;
type PreviewConfig = NonNullable<GameSpecAgentProfileDef['preview']>;

function createDoc(
  preview: PreviewConfig,
  considerations: readonly string[] = ['moveOnly'],
): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'policy-guided-warning-test', players: { min: 2, max: 2 } },
    observability: {
      observers: {
        currentPlayer: {
          surfaces: {
            victory: {
              currentMargin: 'public',
            },
          },
        },
      },
    },
    zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
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
      parameters: {},
      library: {
        considerations: {
          moveOnly: {
            scopes: ['move'],
            weight: 1,
            value: 1,
          },
          microturnOnly: {
            scopes: ['microturn'],
            weight: 1,
            value: 1,
          },
        },
        tieBreakers: {
          stableMoveKey: { kind: 'stableMoveKey' },
        },
      },
      profiles: {
        baseline: {
          observer: 'currentPlayer',
          params: {},
          use: {
            pruningRules: [],
            considerations,
            tieBreakers: ['stableMoveKey'],
          },
          preview,
        },
      },
      bindings: { p1: 'baseline' },
    },
  };
}

function hasAnyWarning(result: ReturnType<typeof compileGameSpecToGameDef>): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.code === WARNING_CODE);
}

describe('policyGuided preview authoring warnings', () => {
  it('warns when policyGuided has no microturn-scope considerations', () => {
    const result = compileGameSpecToGameDef(createDoc({
      mode: 'exactWorld',
      completion: 'policyGuided',
    }));

    const warning = result.diagnostics.find((diagnostic) => (
      diagnostic.code === WARNING_CODE
      && diagnostic.path === 'doc.agents.profiles.baseline.preview.completion'
    ));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(warning?.severity, 'warning');
    assert.match(warning?.message ?? '', /no scopes: \[microturn\] considerations/);
    assert.match(warning?.message ?? '', /fall back to greedy/);
  });

  it('does not warn when policyGuided has a microturn-scope consideration', () => {
    const result = compileGameSpecToGameDef(createDoc({
      mode: 'exactWorld',
      completion: 'policyGuided',
      fallbackCompletionPolicy: 'fail',
    }, ['microturnOnly']));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(hasAnyWarning(result), false);
  });

  it('does not warn for greedy or unset completion policies', () => {
    const greedy = compileGameSpecToGameDef(createDoc({
      mode: 'exactWorld',
      completion: 'greedy',
    }));
    const unset = compileGameSpecToGameDef(createDoc({
      mode: 'exactWorld',
    }));

    assert.equal(greedy.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(unset.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(hasAnyWarning(greedy), false);
    assert.equal(hasAnyWarning(unset), false);
  });
});
