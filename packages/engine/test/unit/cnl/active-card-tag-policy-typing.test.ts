import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { AgentPolicyExpr, CompiledAgentPolicyRef } from '../../../src/kernel/types.js';

const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

function compileWithAgents(agents: Record<string, unknown>) {
  return compileGameSpecToGameDef({
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'active-card-tag-policy-typing', players: { min: 1, max: 1 } },
    observability: {
      observers: {
        testObserver: {
          surfaces: {
            activeCardTag: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: false } },
          },
        },
      },
    },
    zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
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
      },
    ],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [{ seat: 'us', value: 0 }],
    },
    dataAssets: [{ id: 'seats', kind: 'seatCatalog', payload: { seats: [{ id: 'us' }] } }],
    agents,
  });
}

describe('active-card tag policy typing', () => {
  it('types current and preview activeCard tag refs as boolean policy expressions', () => {
    const result = compileWithAgents({
      library: {
        stateFeatures: {
          currentTag: {
            type: 'boolean',
            expr: { ref: 'activeCard.hasTag.pivotal' },
          },
        },
        candidateFeatures: {
          previewTag: {
            type: 'boolean',
            expr: { ref: 'preview.activeCard.hasTag.pivotal' },
            previewFallback: { onUnavailable: 'noContribution' },
          },
        },
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: { guardrails: [], considerations: [], tieBreakers: [] },
        },
      },
      bindings: { us: 'baseline' },
    });

    assert.equal(result.gameDef === null, false, JSON.stringify(result.diagnostics, null, 2));
    assert.deepEqual(result.gameDef?.agents?.compiled.stateFeatures.currentTag?.expr, refExpr({
      kind: 'currentSurface',
      family: 'activeCardTag',
      id: 'pivotal',
    }));
    assert.deepEqual(result.gameDef?.agents?.compiled.candidateFeatures.previewTag?.expr, refExpr({
      kind: 'previewSurface',
      family: 'activeCardTag',
      id: 'pivotal',
    }));
  });

  it('requires fallback for preview activeCard tag candidate features', () => {
    const result = compileWithAgents({
      library: {
        candidateFeatures: {
          previewTag: {
            type: 'boolean',
            expr: { ref: 'preview.activeCard.hasTag.pivotal' },
          },
        },
      },
      profiles: {
        baseline: {
          observer: 'testObserver',
          params: {},
          use: { guardrails: [], considerations: [], tieBreakers: [] },
        },
      },
      bindings: { us: 'baseline' },
    });

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK'
          && diagnostic.path === 'doc.agents.library.candidateFeatures.previewTag.previewFallback',
      ),
      true,
    );
  });
});
