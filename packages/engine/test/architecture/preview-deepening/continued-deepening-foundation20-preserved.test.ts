// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { capturePreview, runPolicyTrace } from './continued-deepening-fixture.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';
import type { PolicyPreviewSignalUnavailableAdvisoryTrace } from '../../../src/kernel/index.js';

describe('continued deepening preserves Foundation 20', () => {
  it('feeds refs that remain unavailable through the existing unknown-preview path', () => {
    const preview = capturePreview('continuedDeepening');

    for (const option of preview.run.options) {
      const status = option.resolvedRefs.get('preview.option.delta.victory.currentMargin.self');
      assert.equal(status?.kind, 'ready');
    }
    assert.equal(preview.usage.coverage.selectedByTieBreakerBecausePreviewUnavailable, false);
  });

  it('records afterDeepPass when the deep phase still leaves every root unavailable', () => {
    const trace = runPolicyTrace('continuedDeepening', (catalog) => {
      const inner = catalog.profiles.baseline?.preview.inner;
      if (inner?.continuedDeepening === undefined) {
        throw new Error('expected continuedDeepening fixture config');
      }
      (inner.continuedDeepening.deep as { depthCap: number }).depthCap = inner.continuedDeepening.broad.depthCap;
    });
    const advisory = trace.advisories?.find((
      entry: PolicyPreviewSignalUnavailableAdvisoryTrace,
    ) => entry.code === 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE');

    assert.ok(advisory, 'unavailable after deep pass must still emit the no-signal advisory');
    assert.equal(trace.previewUsage.coverage.deep?.unavailableRootOptionCount, 3);
    assert.equal(advisory.unavailabilityBreakdown.afterDeepPass, 3);
  });

  it('still rejects preview refs without an explicit fallback', () => {
    const doc: GameSpecDoc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'continued-deepening-fallback-required', players: { min: 2, max: 2 } },
      dataAssets: [{
        id: 'seat-catalog',
        kind: 'seatCatalog',
        payload: { seats: [{ id: 'us' }, { id: 'arvn' }] },
      }],
      turnStructure: { phases: [{ id: 'main' }] },
      terminal: {
        conditions: [],
        margins: [{ seat: 'us', value: 0 }, { seat: 'arvn', value: 0 }],
        ranking: { order: 'desc' },
      },
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
      agents: {
        parameters: {},
        library: {
          considerations: {
            projectedMargin: {
              scopes: ['microturn'],
              weight: 1,
              value: { ref: 'preview.option.delta.victory.currentMargin.self' },
            },
          },
          tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        },
        profiles: {
          baseline: {
            observer: 'currentPlayer',
            params: {},
            use: { guardrails: [], considerations: ['projectedMargin'], tieBreakers: ['stableMoveKey'] },
            preview: {
              mode: 'exactWorld',
              inner: {
                chooseOne: false,
                chooseNStep: true,
                maxOptions: 4,
                chooseNBeamWidth: 1,
                depthCap: 1,
                strategy: 'continuedDeepening',
                capClass: 'deep1024',
                continuedDeepening: {
                  broad: { depthCap: 1 },
                  deep: {
                    depthCap: 3,
                    trigger: ['allRequestedRefsDepthCapped'],
                    rootPolicy: 'allRootsWithinCap',
                  },
                },
              },
            },
          },
        },
        bindings: { us: 'baseline' },
      },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(
      result.diagnostics.some((diagnostic) => (
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK
      )),
      true,
    );
  });
});
