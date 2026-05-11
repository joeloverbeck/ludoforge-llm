// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  captureProjectedLookupFixturePreview,
  projectedTroopCountRefId,
  runProjectedLookupFixtureTrace,
  scalarDriveDepthRefId,
  scoreProjectedCollectionRefs,
} from './projected-lookup-fixture.js';
import { compileProjectedLookupConsiderations, projectedLookupExpr } from './projected-lookup-compile-test-helpers.js';

const contributionFor = (
  trace: ReturnType<typeof runProjectedLookupFixtureTrace>,
  stableKeySuffix: string,
): number | undefined => trace.candidates
  ?.find((candidate) => candidate.stableMoveKey.endsWith(stableKeySuffix))
  ?.scoreContributions
  .find((contribution) => contribution.termId === 'projectedTroopCount')
  ?.contribution;

describe('projected lookup end-to-end fixture', () => {
  it('compiles the authored projected-lookup profile shape', () => {
    const result = compileProjectedLookupConsiderations({
      preferProjectedTroopBuildup: {
        scopes: ['microturn'],
        weight: 100,
        value: projectedLookupExpr(),
        previewFallback: { onUnavailable: 'noContribution' },
      },
    });

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.notEqual(result.gameDef, null);
  });

  it('resolves projected keyed values for all lookup collections without fallback', () => {
    const scored = scoreProjectedCollectionRefs();

    assert.equal(scored.score, 5 + 11 + 7 + 1);
    assert.deepEqual([...scored.unknownPreviewRefs.entries()], []);
    assert.deepEqual([...scored.unknownLookupRefs.entries()], []);
    assert.equal(scored.previewFallbackFired, undefined);
    assert.equal(scored.lookupFallbackFired, undefined);
  });

  it('differentiates chooseN ADD candidates through projected zone lookup values', () => {
    const trace = runProjectedLookupFixtureTrace('projected');

    assert.equal(trace.previewUsage.readyRefStats[projectedTroopCountRefId]?.readyCount, 2);
    assert.equal(trace.previewUsage.readyRefStats[projectedTroopCountRefId]?.distinctValueCount, 2);
    assert.equal(trace.previewUsage.readyRefStats[projectedTroopCountRefId]?.min, 5);
    assert.equal(trace.previewUsage.readyRefStats[projectedTroopCountRefId]?.max, 7);
    assert.equal(contributionFor(trace, '"zone-a:none"'), 5);
    assert.equal(contributionFor(trace, '"zone-b:0"'), 7);
    assert.deepEqual(trace.candidates?.flatMap((candidate) => candidate.unknownPreviewRefs), []);
    assert.deepEqual(trace.candidates?.flatMap((candidate) => candidate.unknownLookupRefs), []);
    assert.equal(trace.candidates?.some((candidate) => candidate.previewFallbackFired !== undefined), false);
    assert.ok(trace.selectedStableMoveKey?.endsWith('"zone-b:0"'));
  });

  it('shows scalar preview refs are uniform where projected keyed refs differentiate', () => {
    const scalarTrace = runProjectedLookupFixtureTrace('scalar');
    const projectedTrace = runProjectedLookupFixtureTrace('projected');

    assert.equal(scalarTrace.previewUsage.readyRefStats[scalarDriveDepthRefId]?.distinctValueCount, 1);
    assert.equal(scalarTrace.previewUsage.readyRefStats[scalarDriveDepthRefId]?.range, 0);
    assert.equal(projectedTrace.previewUsage.readyRefStats[projectedTroopCountRefId]?.distinctValueCount, 2);
    assert.notEqual(scalarTrace.selectedStableMoveKey, projectedTrace.selectedStableMoveKey);
  });

  it('resolves projected lookups after continued-deepening recovers a depth-capped broad pass', () => {
    const preview = captureProjectedLookupFixturePreview('deepening');

    assert.equal(preview.usage.coverage.strategy, 'continuedDeepening');
    assert.deepEqual(preview.usage.coverage.broad, {
      evaluatedRootOptionCount: 2,
      readyRootOptionCount: 0,
      unavailableRootOptionCount: 2,
    });
    assert.deepEqual(preview.usage.coverage.deep, {
      evaluatedRootOptionCount: 2,
      readyRootOptionCount: 2,
      unavailableRootOptionCount: 0,
      triggerFired: 'allRequestedRefsDepthCapped',
    });
    assert.equal(preview.usage.readyRefStats[projectedTroopCountRefId]?.distinctValueCount, 2);
  });
});
