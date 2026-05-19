// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { CnlCompilerDiagnosticCode } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

function createDoc(
  turnShapeEvaluators: Record<string, unknown>,
  extraLibrary: Record<string, unknown> = {},
  extraProfile: Record<string, unknown> = {},
): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agent-turnshape-diagnostics-test', players: { min: 2, max: 2 } },
    observability: {
      observers: {
        testObserver: {
          surfaces: {
            victory: { currentMargin: 'public' },
            globalVars: { visibleMetric: { current: 'public', preview: { visibility: 'public' } } },
          },
        },
      },
    },
    globalVars: [{ name: 'visibleMetric', type: 'int', init: 0, min: -100, max: 100 }],
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
        turnShapeEvaluators: turnShapeEvaluators as any,
        considerations: { stable: { scopes: ['move'], weight: 1, value: 1 } },
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        ...extraLibrary,
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: {
            considerations: ['stable'],
            guardrails: [],
            turnShapeEvaluators: Object.keys(turnShapeEvaluators),
            tieBreakers: ['stableMoveKey'],
          },
          ...extraProfile,
        },
      },
      bindings: { p1: 'baseline' },
    },
  };
}

function validTurnShape(overrides: Record<string, unknown> = {}): any {
  return {
    traceLabel: 'current turn impact',
    source: 'currentPreviewDrive',
    bounds: { depthCapRef: 'profile.preview.inner.depthCap', maxSyntheticDecisions: 8 },
    objectives: [{ id: 'self-standing', delta: { ref: 'preview.option.victory.currentMargin.self' } }],
    minimumImpact: { gt: [{ ref: 'turnShape.good.objective.self-standing.delta' }, 0] },
    fallback: { onPreviewUnavailable: 'traceOnly' },
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

describe('agent turn-shape diagnostics', () => {
  it('compiles the turn-shape bucket, profile use, and refs', () => {
    const result = compileGameSpecToGameDef(createDoc({ good: validTurnShape() }));

    assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
    assert.equal(result.gameDef?.agents?.compiled.turnShapeEvaluators?.good?.costClass, 'preview');
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.use.turnShapeEvaluators, ['good']);
  });

  it('reports unknown refs and objective value requirements', () => {
    assertCode(
      createDoc({ good: validTurnShape({ minimumImpact: { ref: 'turnShape.missing.minimumImpactSatisfied' } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_REF_UNKNOWN,
    );
    assertCode(
      createDoc({ good: validTurnShape({ objectives: [{ id: 'missing' }] }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_REQUIRES_VALUE_OR_DELTA,
    );
    assertCode(
      createDoc({ good: validTurnShape({ objectives: [{ id: 'both', value: 1, delta: 2 }] }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_HAS_BOTH_VALUE_AND_DELTA,
    );
  });

  it('reports unregistered preview drive and demote fallback diagnostics', () => {
    assertCode(
      createDoc({ good: validTurnShape({ objectives: [{ id: 'missing-drive', delta: { ref: 'preview.option.var.global.notRegistered' } }] }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_REQUIRES_UNREGISTERED_PREVIEW_DRIVE,
    );
    assertCode(
      createDoc({ good: validTurnShape({ fallback: { onPreviewUnavailable: 'demote' } }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_FALLBACK_DEMOTE_REQUIRES_PENALTY,
    );
  });

  it('reports dependency cycles, duplicate objective ids, and duplicate trace labels', () => {
    assertCode(
      createDoc({
        good: validTurnShape({ minimumImpact: { ref: 'turnShape.other.minimumImpactSatisfied' } }),
        other: validTurnShape({
          traceLabel: 'other impact',
          minimumImpact: { ref: 'turnShape.good.minimumImpactSatisfied' },
        }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_DEPENDENCY_CYCLE,
    );
    assertCode(
      createDoc({ good: validTurnShape({ objectives: [{ id: 'dup', value: 1 }, { id: 'dup', delta: 2 }] }) }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_ID_DUPLICATE,
    );
    assertCode(
      createDoc({
        good: validTurnShape(),
        duplicate: validTurnShape({ traceLabel: 'current turn impact' }),
      }),
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_TURNSHAPE_TRACE_LABEL_DUPLICATE,
    );
  });
});
