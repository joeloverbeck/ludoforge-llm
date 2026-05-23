// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(postureEvaluator: Record<string, unknown>, postureHook = 'sustain'): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agent-posture-evaluator-compile-test', players: { min: 2, max: 2 } },
    observability: {
      observers: {
        testObserver: {
          surfaces: { victory: { currentMargin: 'public' } },
        },
      },
    },
    zones: [
      { id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'set', attributes: { population: 1 } },
      { id: 'zone-b', owner: 'none', visibility: 'public', ordering: 'set', attributes: { population: 2 } },
    ],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{
      id: 'pass',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      params: [{
        name: 'pass.target',
        domain: { query: 'mapSpaces' },
      }],
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
        selectors: {
          targetSpace: {
            scopes: ['move'],
            source: { collection: { kind: 'zones' } },
            quality: { components: [{ id: 'constant', value: 1, weight: 1 }], order: 'qualityDesc' },
            result: { maxItems: 4, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
          },
        },
        planTemplates: {
          posturePlan: {
            traceLabel: 'posture-plan',
            root: { actionTags: ['pass'] },
            roles: {
              target: { selector: 'targetSpace', required: true },
            },
            steps: [
              {
                label: 'select-target',
                role: 'target',
                match: { decisionKind: 'chooseOne', targetKind: 'zone', decisionPath: 'pass.target' },
              },
            ],
            caps: { capClass: 'standard256', maxSteps: 1 },
            postureHook,
            fallback: { ifPreviewUnavailable: 'traceOnly' },
          },
        },
        postureEvaluators: postureEvaluator as any,
        relationships: {
          ally: { role: 'nominalAlly', seat: 'p2', priority: 0, gainValue: 1 },
        },
        considerations: {
          neutral: { scopes: ['move'], weight: 1, value: 0 },
        },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: { considerations: ['neutral'], guardrails: [], tieBreakers: ['stableMoveKey'] },
        },
      },
      bindings: { p1: 'baseline' },
    },
  };
}

function validPostureEvaluator(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sustain: {
      traceLabel: 'sustain posture',
      must: [{ id: 'resource-floor', condition: true, onViolation: 'demote', demotePenalty: -5 }],
      prefer: [{
        id: 'margin-gain',
        when: true,
        value: 3,
        weight: 2,
        fallback: { contribution: 0 },
      }],
      ...overrides,
    },
  };
}

describe('agent posture-evaluator compiler bucket', () => {
  it('compiles a posture evaluator referenced by a plan template deterministically', () => {
    const first = compileGameSpecToGameDef(createDoc(validPostureEvaluator()));
    const second = compileGameSpecToGameDef(createDoc(validPostureEvaluator()));

    assert.deepEqual(first.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.deepEqual(second.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);

    const posture = first.gameDef?.agents?.compiled.postureEvaluators?.sustain;
    assert.equal(posture?.traceLabel, 'sustain posture');
    assert.deepEqual(posture?.must.map((entry) => entry.id), ['resource-floor']);
    assert.deepEqual(posture?.prefer.map((entry) => entry.id), ['margin-gain']);
    assert.equal(first.gameDef?.agents?.compiled.postureEvaluators?.sustain?.prefer[0]?.fallback.contribution.kind, 'literal');
    assert.deepEqual(
      first.gameDef?.agents?.library.planTemplates?.posturePlan?.dependencies.postureEvaluators,
      ['sustain'],
    );
    assert.equal((first.gameDef?.agents?.profiles.baseline?.use as any).postureEvaluators, undefined);
    assert.equal(JSON.stringify(first.gameDef), JSON.stringify(second.gameDef));
  });

  it('rejects a posture prefer term without an explicit fallback contribution', () => {
    const result = compileGameSpecToGameDef(createDoc(validPostureEvaluator({
      prefer: [{ id: 'missing-fallback', value: 1, weight: 1 }],
    })));

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POSTURE_PREFER_REQUIRES_FALLBACK
      ),
      true,
    );
  });

  it('rejects a plan-template postureHook that names an unknown evaluator', () => {
    const result = compileGameSpecToGameDef(createDoc(validPostureEvaluator(), 'missing'));

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POSTURE_REF_UNKNOWN
        && diagnostic.path === 'doc.agents.library.planTemplates.posturePlan.postureHook'
      ),
      true,
    );
  });

  it('rejects a posture term that references an undeclared relationship role', () => {
    const result = compileGameSpecToGameDef(createDoc(validPostureEvaluator({
      prefer: [{
        id: 'missing-relationship-role',
        when: { eq: [{ ref: 'relationship.nearWin.seat' }, { ref: 'relationship.nominalAlly.seat' }] },
        value: { ref: 'relationship.nominalAlly.gainValue' },
        weight: 1,
        fallback: { contribution: 0 },
      }],
    })));

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POSTURE_REF_UNKNOWN
        && diagnostic.path.includes('postureEvaluators.sustain.prefer.0.when')
        && diagnostic.message.includes('relationship.nearWin.seat')
      ),
      true,
      `Expected undeclared relationship role diagnostic: ${JSON.stringify(result.diagnostics)}`,
    );
  });
});
