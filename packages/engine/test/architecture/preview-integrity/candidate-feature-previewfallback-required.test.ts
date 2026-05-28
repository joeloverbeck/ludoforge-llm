// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecCandidateFeatureDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';
import {
  createCandidateFeaturePreviewIntegrityFixture,
  runPreviewIntegrityPolicyTraceForFixture,
} from './preview-integrity-fixture.js';

const REQUIRED_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK;

const refExpr = (ref: string) => ({ ref }) as const;

function baseDoc(candidateFeatures: Readonly<Record<string, GameSpecCandidateFeatureDef>>): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'candidate-feature-previewfallback-required', players: { min: 2, max: 2 } },
    dataAssets: [{
      id: 'seat-catalog',
      kind: 'seatCatalog',
      payload: { seats: [{ id: 'us' }, { id: 'them' }] },
    }],
    zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    terminal: {
      conditions: [],
      margins: [{ seat: 'us', value: 0 }, { seat: 'them', value: 0 }],
      ranking: { order: 'desc' },
    },
    observability: {
      observers: {
        currentPlayer: {
          surfaces: {
            victory: { currentMargin: 'public' },
          },
        },
      },
    },
    agents: {
      parameters: {},
      library: {
        candidateFeatures,
        considerations: {},
        tieBreakers: {},
      },
      profiles: {},
      bindings: {},
    },
  };
}

describe('candidate-feature previewFallback contract', () => {
  it('rejects preview-derived candidate features without explicit fallback', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      projectedMargin: {
        type: 'number',
        expr: refExpr('preview.victory.currentMargin.self'),
      },
    }));

    const diagnostic = result.diagnostics.find((entry) => entry.code === REQUIRED_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.candidateFeatures.projectedMargin.previewFallback');
    assert.match(diagnostic?.message ?? '', /Candidate feature "projectedMargin"/u);
    assert.match(diagnostic?.message ?? '', /preview\.victory\.currentMargin\.self/u);
  });

  it('retains compiled fallback for preview-derived candidate features', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      projectedMargin: {
        type: 'number',
        expr: refExpr('preview.victory.currentMargin.self'),
        previewFallback: { onUnavailable: 'noContribution' },
      },
    }));

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.deepEqual(
      result.gameDef?.agents?.library.candidateFeatures.projectedMargin?.previewFallback,
      { onUnavailable: 'noContribution' },
    );
    assert.deepEqual(
      result.gameDef?.agents?.compiled.candidateFeatures.projectedMargin?.previewFallback,
      { onUnavailable: 'noContribution' },
    );
  });

  it('traces candidate-feature fallback when preview is unavailable', () => {
    const fixture = createCandidateFeaturePreviewIntegrityFixture(false, 'noContribution');
    const trace = runPreviewIntegrityPolicyTraceForFixture(fixture);

    for (const candidate of trace.candidates ?? []) {
      assert.deepEqual(candidate.previewFallbackFired, {
        termId: 'feature.projectedMargin',
        kind: 'noContribution',
      });
    }
  });
});
