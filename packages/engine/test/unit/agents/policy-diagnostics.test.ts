// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPolicyAgentDecisionTrace, buildPolicyDiagnosticsSnapshot } from '../../../src/agents/policy-diagnostics.js';
import type { PolicyEvaluationMetadata } from '../../../src/agents/policy-eval.js';
import type { GameDef } from '../../../src/kernel/index.js';

function createMetadata(): PolicyEvaluationMetadata {
  return {
    seatId: 'us',
    requestedProfileId: 'baseline',
    profileId: 'baseline',
    profileFingerprint: 'baseline-fingerprint',
    canonicalOrder: ['alpha', 'beta', 'gamma'],
    candidates: [
      {
        actionId: 'advance',
        stableMoveKey: 'alpha',
        score: 7,
        prunedBy: [],
        scoreContributions: [{ termId: 'preferAdvance', contribution: 7 }],
        previewRefIds: ['globalVar.usMargin'],
        unknownPreviewRefs: [],
        previewOutcome: 'ready',
        grantedOperationSimulated: true,
        grantedOperationMove: {
          actionId: 'rally',
          params: { zone: 'tay-ninh' },
        },
        grantedOperationMarginDelta: 3,
      },
      {
        actionId: 'pass',
        stableMoveKey: 'beta',
        score: 1,
        prunedBy: ['dropPass'],
        scoreContributions: [{ termId: 'preferAdvance', contribution: 1 }],
        previewRefIds: ['globalVar.usMargin'],
        unknownPreviewRefs: [{ refId: 'globalVar.usMargin', reason: 'hidden' }],
        previewOutcome: 'hidden',
      },
      {
        actionId: 'event',
        stableMoveKey: 'gamma',
        score: -2,
        prunedBy: [],
        scoreContributions: [{ termId: 'preferAdvance', contribution: -2 }],
        previewRefIds: ['globalVar.usMargin'],
        unknownPreviewRefs: [{ refId: 'globalVar.usMargin', reason: 'unresolved' }],
        previewOutcome: 'unresolved',
        previewFailureReason: 'structurallyUnsatisfiable',
      },
    ],
    pruningSteps: [{ ruleId: 'dropPass', remainingCandidateCount: 2, skippedBecauseEmpty: false }],
    tieBreakChain: [],
    previewUsage: {
      mode: 'exactWorld',
      evaluatedCandidateCount: 3,
      refIds: ['globalVar.usMargin'],
      unknownRefs: [{ refId: 'globalVar.usMargin', reason: 'hidden' }],
      outcomeBreakdown: {
        ready: 1,
        stochastic: 0,
        unknownRandom: 0,
        unknownHidden: 1,
        unknownUnresolved: 0,
        unknownFailed: 0,
      },
    },
    selectedStableMoveKey: 'alpha',
    finalScore: 7,
    phase1Score: 5,
    phase2Score: 7,
    phase1ActionRanking: ['advance', 'pass', 'event'],
    usedFallback: false,
    failure: null,
  };
}

describe('policy-diagnostics', () => {
  it('omits verbose-only diagnostics at summary level', () => {
    const trace = buildPolicyAgentDecisionTrace(createMetadata(), 'summary');

    assert.deepEqual(trace.previewUsage.outcomeBreakdown, {
      ready: 1,
      stochastic: 0,
      unknownRandom: 0,
      unknownHidden: 1,
      unknownUnresolved: 0,
      unknownFailed: 0,
    });
    assert.equal(trace.phase1Score, 5);
    assert.equal(trace.phase2Score, 7);
    assert.deepEqual(trace.phase1ActionRanking, ['advance', 'pass', 'event']);
    assert.equal(trace.candidates, undefined);
  });

  it('includes verbose candidate preview outcomes without legacy preparation diagnostics', () => {
    const trace = buildPolicyAgentDecisionTrace(createMetadata(), 'verbose');

    assert.equal('completionStatistics' in trace, false);
    assert.equal('movePreparations' in trace, false);
    assert.equal(trace.candidates?.length, 3);
    assert.equal(trace.candidates?.[0]?.previewOutcome, 'ready');
    assert.equal(trace.candidates?.[0]?.grantedOperationSimulated, true);
    assert.deepEqual(trace.candidates?.[0]?.grantedOperationMove, {
      actionId: 'rally',
      params: { zone: 'tay-ninh' },
    });
    assert.equal(trace.candidates?.[0]?.grantedOperationMarginDelta, 3);
    assert.equal(trace.candidates?.[1]?.previewOutcome, 'hidden');
    assert.equal(trace.candidates?.[1]?.grantedOperationSimulated, undefined);
    assert.equal(trace.candidates?.[0]?.previewFailureReason, undefined);
    assert.equal(trace.candidates?.[2]?.previewOutcome, 'unresolved');
    assert.equal(trace.candidates?.[2]?.previewFailureReason, 'structurallyUnsatisfiable');
  });

  it('omits phase fields when metadata does not provide them', () => {
    const full = createMetadata();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { phase1Score, phase2Score, phase1ActionRanking, ...metadata } = full;

    const trace = buildPolicyAgentDecisionTrace(metadata, 'summary');

    assert.equal(trace.phase1Score, undefined);
    assert.equal(trace.phase2Score, undefined);
    assert.equal(trace.phase1ActionRanking, undefined);
  });

  it('includes preview-state feature refs in snapshot preview surface reporting', () => {
    const metadata: PolicyEvaluationMetadata = {
      ...createMetadata(),
      previewUsage: {
        ...createMetadata().previewUsage,
        refIds: ['feature.vcGuerrillaCount'],
        unknownRefs: [{ refId: 'feature.vcGuerrillaCount', reason: 'unresolved' }],
      },
      candidates: [{
        ...createMetadata().candidates[0]!,
        previewRefIds: ['feature.vcGuerrillaCount'],
        unknownPreviewRefs: [{ refId: 'feature.vcGuerrillaCount', reason: 'unresolved' }],
        previewOutcome: 'unresolved',
      }],
    };
    const def: GameDef = {
      metadata: { id: 'policy-diagnostics-preview-feature', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      derivedMetrics: [],
      seats: [{ id: 'us' }, { id: 'arvn' }],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: 'main' as never }] },
      agents: {
        schemaVersion: 2,
        catalogFingerprint: 'preview-feature-catalog',
        surfaceVisibility: {
          globalVars: {},
          globalMarkers: {},
          perPlayerVars: {},
          derivedMetrics: {},
          victory: {
            currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
            currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
          },
          activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
          activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
          activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
          activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        },
        parameterDefs: {},
        candidateParamDefs: {},
        library: {
          stateFeatures: {
            vcGuerrillaCount: {
              type: 'number',
              costClass: 'state',
              expr: { kind: 'literal', value: 0 },
              dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
            },
          },
          candidateFeatures: {
            projectedVcGuerrillaCount: {
              type: 'number',
              costClass: 'preview',
              expr: { kind: 'ref', ref: { kind: 'library', refKind: 'previewStateFeature', id: 'vcGuerrillaCount' } },
              dependencies: { parameters: [], stateFeatures: ['vcGuerrillaCount'], candidateFeatures: [], aggregates: [], strategicConditions: [] },
            },
          },
          candidateAggregates: {},
          pruningRules: {},
          considerations: {
            preferProjectedCount: {
              scopes: ['move'],
              costClass: 'preview',
              weight: { kind: 'literal', value: 1 },
              value: { kind: 'ref', ref: { kind: 'library', refKind: 'candidateFeature', id: 'projectedVcGuerrillaCount' } },
              dependencies: { parameters: [], stateFeatures: ['vcGuerrillaCount'], candidateFeatures: ['projectedVcGuerrillaCount'], aggregates: [], strategicConditions: [] },
            },
          },
          tieBreakers: {},
          strategicConditions: {},
        },
        profiles: {
          baseline: {
            fingerprint: 'baseline',
            params: {},
            preview: { mode: 'exactWorld' },
            selection: { mode: 'argmax' },
            use: { pruningRules: [], considerations: ['preferProjectedCount'], tieBreakers: [] },
            plan: {
              stateFeatures: ['vcGuerrillaCount'],
              candidateFeatures: ['projectedVcGuerrillaCount'],
              candidateAggregates: [],
              considerations: ['preferProjectedCount'],
            },
          },
        },
        bindingsBySeat: { us: 'baseline' },
      },
      actions: [],
      triggers: [],
      terminal: { conditions: [] },
    };

    const snapshot = buildPolicyDiagnosticsSnapshot(def, metadata, 'verbose');

    assert.deepEqual(snapshot.surfaceRefs.preview, ['feature.vcGuerrillaCount']);
  });

  it('includes nested seatAgg refs in diagnostic surface reporting', () => {
    const metadata = createMetadata();
    const def: GameDef = {
      metadata: { id: 'policy-diagnostics-seat-agg', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      derivedMetrics: [],
      seats: [{ id: 'us' }, { id: 'arvn' }],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: 'main' as never }] },
      agents: {
        schemaVersion: 2,
        catalogFingerprint: 'seat-agg-catalog',
        surfaceVisibility: {
          globalVars: {},
          globalMarkers: {},
          perPlayerVars: {},
          derivedMetrics: {},
          victory: {
            currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
            currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
          },
          activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
          activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
          activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
          activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        },
        parameterDefs: {},
        candidateParamDefs: {},
        library: {
          stateFeatures: {
            maxOpponentMargin: {
              type: 'number',
              costClass: 'state',
              expr: {
                kind: 'seatAgg',
                over: 'opponents',
                expr: {
                  kind: 'ref',
                  ref: {
                    kind: 'currentSurface',
                    family: 'victoryCurrentMargin',
                    id: 'currentMargin',
                    selector: { kind: 'role', seatToken: '$seat' },
                  },
                },
                aggOp: 'max',
              },
              dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
            },
            projectedThreat: {
              type: 'number',
              costClass: 'preview',
              expr: {
                kind: 'seatAgg',
                over: 'opponents',
                expr: {
                  kind: 'ref',
                  ref: {
                    kind: 'previewSurface',
                    family: 'victoryCurrentMargin',
                    id: 'currentMargin',
                    selector: { kind: 'role', seatToken: '$seat' },
                  },
                },
                aggOp: 'max',
              },
              dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
            },
          },
          candidateFeatures: {},
          candidateAggregates: {},
          pruningRules: {},
          considerations: {},
          tieBreakers: {},
          strategicConditions: {},
        },
        profiles: {
          baseline: {
            fingerprint: 'baseline',
            params: {},
            preview: { mode: 'exactWorld' },
            selection: { mode: 'argmax' },
            use: { pruningRules: [], considerations: [], tieBreakers: [] },
            plan: {
              stateFeatures: ['maxOpponentMargin', 'projectedThreat'],
              candidateFeatures: [],
              candidateAggregates: [],
              considerations: [],
            },
          },
        },
        bindingsBySeat: { us: 'baseline', arvn: 'baseline' },
      },
      actions: [],
      triggers: [],
      terminal: { conditions: [] },
    };

    const snapshot = buildPolicyDiagnosticsSnapshot(def, metadata, 'verbose');

    assert.deepEqual(snapshot.surfaceRefs.current, ['victoryCurrentMargin.currentMargin.$seat']);
    assert.deepEqual(snapshot.surfaceRefs.preview, ['victoryCurrentMargin.currentMargin.$seat']);
  });
});
