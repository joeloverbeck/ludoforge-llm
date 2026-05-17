// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageJson } from '../../helpers/lint-policy-helpers.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = findEnginePackageJson(thisDir);
const engineRoot = dirname(packageJsonPath);
const renderingModulePath = resolve(engineRoot, 'scripts/profile-fitl-arvn-15-seed-report-rendering.mjs');

describe('FITL ARVN decomposition report rendering', () => {
  it('serializes same-run attribution fields for no-counter and terminal-boundary rows', async () => {
    const { renderCsv, renderMarkdown } = await import(pathToFileURL(renderingModulePath).href) as {
      readonly renderCsv: (rows: readonly Record<string, unknown>[]) => string;
      readonly renderMarkdown: (rollup: Record<string, unknown>, options: Record<string, unknown>) => string;
    };
    const row = {
      seed: 1005,
      decisionIndex: 1,
      microturnClass: 'coupArvnRedeployPolice:chooseOne',
      elapsedMs: 10,
      previewBranch: 'continuedDeepening',
      wasmScoreRowRouteCount: 0,
      wasmScoreRowUnsupportedCount: 0,
      wasmPreviewCandidateFeatureRowRouteCount: 0,
      wasmPreviewCandidateFeatureRowUnsupportedCount: 0,
      wasmProductionPreviewDriveRouteCount: 0,
      wasmProductionPreviewDriveUnsupportedCount: 1,
      wasmProductionPreviewDriveUnsupportedReasons: [{
        unsupportedDriveClass: 'unknown',
        unsupportedOwner: 'production-deep-choosenstep-continuation.projectedState',
        reason: 'deep preview-drive reached a terminal boundary before materializing a WASM projected state',
        projectedStateBoundaryKind: 'depthCap',
        projectedStateClassification: 'expected-terminal-boundary',
        count: 1,
      }],
      hotPathBuckets: [
        { key: 'tokenStateIndex:build', count: 2, totalMs: 3.5 },
        { key: 'evalQuery:countMatchingTokens', count: 4, totalMs: 1.25 },
      ],
    };

    const csv = renderCsv([row]);
    assert.match(csv, /hotPathBucketFamilies/u);
    assert.match(csv, /tokenStateIndex:2\/3\.5ms; evalQuery:4\/1\.25ms/u);
    assert.match(csv, /continuedDeepeningResidualSplit/u);
    assert.match(csv, /terminalBoundaryProjectionSplit/u);
    assert.match(csv, /expected-terminal-boundary\/depthCap:1/u);

    const markdown = renderMarkdown({
      date: 'test',
      command: 'node script',
      perSeed: [],
      seedCount: 0,
      acceptance: { reportRowCount: 1, hotAxisOver3x: false },
      timeoutMs: 1,
      noWasm: false,
      wasmTimingProfile: false,
      perDecisionClass: [{
        key: 'coupArvnRedeployPolice:chooseOne',
        wasmProductionPreviewDriveUnsupportedCount: 1,
        wasmProductionPreviewDriveUnsupportedReasons: row.wasmProductionPreviewDriveUnsupportedReasons,
      }],
      topNHotAxes: [],
      fastSlowDeltas: [],
    }, {
      csvPath: '/tmp/report.csv',
      profileBuckets: false,
      relativeToRepo: (path: string) => path,
    });
    assert.match(markdown, /Terminal-Boundary Projected-State Split/u);
    assert.match(markdown, /expected-terminal-boundary/u);
    assert.match(markdown, /depthCap/u);
  });

  it('renders a continued-deepening no-counter residual split', async () => {
    const { renderCsv, renderMarkdown } = await import(pathToFileURL(renderingModulePath).href) as {
      readonly renderCsv: (rows: readonly Record<string, unknown>[]) => string;
      readonly renderMarkdown: (rollup: Record<string, unknown>, options: Record<string, unknown>) => string;
    };
    const row = {
      seed: 1005,
      decisionIndex: 1,
      microturnClass: 'coupArvnRedeployPolice:chooseOne',
      elapsedMs: 20,
      previewBranch: 'continuedDeepening',
      wasmScoreRowRouteCount: 0,
      wasmScoreRowUnsupportedCount: 0,
      wasmPreviewCandidateFeatureRowRouteCount: 0,
      wasmPreviewCandidateFeatureRowUnsupportedCount: 0,
      wasmProductionPreviewDriveRouteCount: 0,
      wasmProductionPreviewDriveUnsupportedCount: 0,
      hotPathBuckets: [
        { key: 'policyInnerPreview:chooseOneRun', count: 2, totalMs: 5 },
        { key: 'policyInnerPreviewSubroutine:resolveRefs', count: 2, totalMs: 4 },
        { key: 'policyMicroturnSearch:chooseOneScoreOptions', count: 4, totalMs: 7 },
        { key: 'tokenStateIndex:build', count: 1, totalMs: 3 },
      ],
    };

    const csv = renderCsv([row]);
    assert.match(csv, /continued-deepening-orchestration-inclusive:2\/5ms/u);
    assert.match(csv, /inner-preview-subroutine-nested:2\/4ms/u);
    assert.match(csv, /policy-search-candidate-scoring-nested:4\/7ms/u);
    assert.match(csv, /existing-hot-path-bucket-nested:1\/3ms/u);
    assert.match(csv, /unattributed-after-top-level-orchestration:\/15ms/u);

    const markdown = renderMarkdown({
      date: 'test',
      command: 'node script',
      perSeed: [],
      seedCount: 0,
      acceptance: { reportRowCount: 1, hotAxisOver3x: false },
      timeoutMs: 1,
      noWasm: false,
      wasmTimingProfile: false,
      perDecisionClass: [],
      topNHotAxes: [{
        ...row,
        key: 'coupArvnRedeployPolice:chooseOne|continuedDeepening',
        microturnClass: 'coupArvnRedeployPolice:chooseOne',
        previewBranch: 'continuedDeepening',
        totalMs: 20,
        count: 1,
        meanMs: 20,
        p95Ms: 20,
        maxMs: 20,
        cacheHits: 0,
        cacheMisses: 0,
        cacheCompileTimeMs: 0,
      }],
      fastSlowDeltas: [],
    }, {
      csvPath: '/tmp/report.csv',
      profileBuckets: true,
      relativeToRepo: (path: string) => path,
    });
    assert.match(markdown, /Continued-Deepening No-Counter Residual Split/u);
    assert.match(markdown, /continued-deepening-orchestration-inclusive/u);
    assert.match(markdown, /inner-preview-subroutine-nested/u);
    assert.match(markdown, /policy-search-candidate-scoring-nested/u);
  });

  it('orders hot-path bucket families without ambient locale comparison', async () => {
    const { renderCsv } = await import(pathToFileURL(renderingModulePath).href) as {
      readonly renderCsv: (rows: readonly Record<string, unknown>[]) => string;
    };
    const originalLocaleCompare = String.prototype.localeCompare;
    try {
      String.prototype.localeCompare = () => -1;
      const csv = renderCsv([{
        seed: 1005,
        decisionIndex: 1,
        microturnClass: 'coupArvnRedeployPolice:chooseOne',
        elapsedMs: 10,
        hotPathBuckets: [
          { key: 'zFamily:work', count: 1, totalMs: 1 },
          { key: 'aFamily:work', count: 1, totalMs: 1 },
        ],
      }]);
      assert.match(csv, /aFamily:1\/1ms; zFamily:1\/1ms/u);
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
  });
});
