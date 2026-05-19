// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';

function createDocWithPreview(preview: Record<string, unknown>) {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'post-grant-preview-config', players: { min: 1, max: 1 } },
    observability: {
      observers: {
        testObserver: {
          surfaces: {
            victory: {
              currentMargin: 'public' as const,
            },
          },
        },
      },
    },
    dataAssets: [{
      id: 'seats',
      kind: 'seatCatalog' as const,
      payload: {
        seats: [{ id: 'us' }],
      },
    }],
    zones: [],
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
    }],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [{ seat: 'us', value: 0 }],
      ranking: { order: 'desc' as const },
    },
    agents: {
      parameters: {},
      library: {
        tieBreakers: {
          stableMoveKey: {
            kind: 'stableMoveKey',
          },
        },
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: {
            guardrails: [],
            considerations: [],
            tieBreakers: ['stableMoveKey'],
          },
          preview,
        },
      },
      bindings: {
        us: 'baseline',
      },
    },
  };
}

describe('preview outcomeGrantContinuation validation', () => {
  it('rejects enabled outcomeGrantContinuation without an extraDepthCap', () => {
    const result = compileGameSpecToGameDef(createDocWithPreview({
      mode: 'exactWorld',
      outcomeGrantContinuation: {
        enabled: true,
        capClass: 'postGrant16',
      },
    }));

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_EXTRA_DEPTH_CAP_INVALID'
        && diagnostic.path === 'doc.agents.profiles.baseline.preview.outcomeGrantContinuation.extraDepthCap'
      ),
      true,
    );
    assert.equal(result.gameDef?.agents?.profiles.baseline, undefined);
  });

  it('rejects unknown post-grant cap classes', () => {
    const result = compileGameSpecToGameDef(createDocWithPreview({
      mode: 'exactWorld',
      outcomeGrantContinuation: {
        enabled: true,
        extraDepthCap: 4,
        capClass: 'postGrant99',
      },
    }));

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_CAP_CLASS_UNKNOWN'
        && diagnostic.path === 'doc.agents.profiles.baseline.preview.outcomeGrantContinuation.capClass'
      ),
      true,
    );
    assert.equal(result.gameDef?.agents?.profiles.baseline, undefined);
  });

  it('lowers valid postGrant16 config into the compiled profile', () => {
    const result = compileGameSpecToGameDef(createDocWithPreview({
      mode: 'exactWorld',
      outcomeGrantContinuation: {
        enabled: true,
        extraDepthCap: 4,
        capClass: 'postGrant16',
      },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview.outcomeGrantContinuation, {
      enabled: true,
      extraDepthCap: 4,
      capClass: 'postGrant16',
    });
  });
});
