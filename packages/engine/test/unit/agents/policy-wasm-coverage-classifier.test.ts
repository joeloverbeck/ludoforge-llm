// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyCandidateFeatureCoverage } from '../../../src/agents/policy-wasm-coverage-classifier.js';
import type {
  AgentPolicyCatalog,
  CompiledAgentProfile,
  CompiledPolicyCandidateFeature,
  CompiledPolicyExpr,
  GameDef,
} from '../../../src/kernel/index.js';

/*
 * Spec 206 ticket 206WASMCANDCOV-001 — classifier shape coverage.
 *
 * The classifier is a pure static function of (profile, catalog, def). These
 * fixtures hand-build minimal compiled exprs for each candidate-feature shape
 * the production FITL profiles exercise, plus the synthetic edge shapes (mixed,
 * unsupported op, cross-ref ordering, zero-preview). No game execution and no
 * WASM module are required (Foundation #10). FITL identifiers appear only as
 * fixture data — the classifier itself is game-agnostic (Foundation #1).
 */

const emptyDeps = {
  parameters: [] as readonly string[],
  stateFeatures: [] as readonly string[],
  candidateFeatures: [] as readonly string[],
  aggregates: [] as readonly string[],
  strategicConditions: [] as readonly string[],
};

const previewFeature = (expr: CompiledPolicyExpr): CompiledPolicyCandidateFeature => ({
  type: 'number',
  costClass: 'preview',
  expr,
  dependencies: emptyDeps,
});

const cheapFeature = (expr: CompiledPolicyExpr): CompiledPolicyCandidateFeature => ({
  type: 'number',
  costClass: 'candidate',
  expr,
  dependencies: emptyDeps,
});

interface HarnessInput {
  readonly candidateFeatures: Readonly<Record<string, CompiledPolicyCandidateFeature>>;
  readonly stateFeatures?: AgentPolicyCatalog['compiled']['stateFeatures'];
  readonly planOrder: readonly string[];
}

const classify = (input: HarnessInput) => {
  const def = {
    seats: [{ id: 'us' }, { id: 'arvn' }, { id: 'nva' }, { id: 'vc' }],
    globalVars: [{ name: 'aid' }, { name: 'trail' }],
  } as unknown as GameDef;
  const catalog = {
    compiled: {
      candidateFeatures: input.candidateFeatures,
      stateFeatures: input.stateFeatures ?? {},
    },
  } as unknown as AgentPolicyCatalog;
  const profile = {
    plan: { candidateFeatures: input.planOrder },
  } as unknown as CompiledAgentProfile;
  return classifyCandidateFeatureCoverage({ profile, catalog, def });
};

const coverageOf = (
  verdicts: readonly { readonly id: string; readonly coverage: string; readonly reason: string }[],
  id: string,
) => verdicts.find((verdict) => verdict.id === id);

// Shared compiled-expr building blocks (mirroring data/games/fire-in-the-lake/92-agents.md).
const previewVictoryMarginSelf: CompiledPolicyExpr = {
  kind: 'ref',
  ref: { kind: 'previewSurface', family: 'victoryCurrentMargin', id: 'currentMargin', selector: { kind: 'role', seatToken: 'self' } },
};
const previewVictoryMarginSeat: CompiledPolicyExpr = {
  kind: 'ref',
  ref: { kind: 'previewSurface', family: 'victoryCurrentMargin', id: 'currentMargin', selector: { kind: 'role', seatToken: '$seat' } },
};
const currentVictoryMarginSeat: CompiledPolicyExpr = {
  kind: 'ref',
  ref: { kind: 'currentSurface', family: 'victoryCurrentMargin', id: 'currentMargin', selector: { kind: 'role', seatToken: '$seat' } },
};
const previewGlobalAid: CompiledPolicyExpr = {
  kind: 'ref',
  ref: { kind: 'previewSurface', family: 'globalVar', id: 'aid' },
};
const currentGlobalAid: CompiledPolicyExpr = {
  kind: 'ref',
  ref: { kind: 'currentSurface', family: 'globalVar', id: 'aid' },
};
const previewStateFeatureRef = (id: string): CompiledPolicyExpr => ({
  kind: 'ref',
  ref: { kind: 'library', refKind: 'previewStateFeature', id },
});
const stateFeatureRef = (id: string): CompiledPolicyExpr => ({
  kind: 'ref',
  ref: { kind: 'library', refKind: 'stateFeature', id },
});
const candidateFeatureRef = (id: string): CompiledPolicyExpr => ({
  kind: 'ref',
  ref: { kind: 'library', refKind: 'candidateFeature', id },
});
const literal = (value: number): CompiledPolicyExpr => ({ kind: 'literal', value });

describe('Spec 206 candidate-feature coverage classifier', () => {
  it('classifies a top-level role-seatAgg over a previewSurface leaf as wasm-row (projectedCurrentLeaderMargin shape)', () => {
    const verdicts = classify({
      candidateFeatures: {
        projectedCurrentLeaderMargin: previewFeature({
          kind: 'seatAgg',
          over: { role: 'currentLeader' },
          expr: previewVictoryMarginSeat,
          aggOp: 'sum',
          availability: 'selfAndTargetReady',
        }),
      },
      planOrder: ['projectedCurrentLeaderMargin'],
    });
    assert.equal(coverageOf(verdicts, 'projectedCurrentLeaderMargin')?.coverage, 'wasm-row');
  });

  it('classifies a top-level coalesce wrapping a nested role-seatAgg over a currentSurface leaf as ts-oracle (projectedLeaderMarginDelta shape)', () => {
    const verdicts = classify({
      candidateFeatures: {
        projectedCurrentLeaderMargin: previewFeature({
          kind: 'seatAgg',
          over: { role: 'currentLeader' },
          expr: previewVictoryMarginSeat,
          aggOp: 'sum',
        }),
        projectedLeaderMarginDelta: previewFeature({
          kind: 'op',
          op: 'coalesce',
          args: [
            {
              kind: 'op',
              op: 'sub',
              args: [
                candidateFeatureRef('projectedCurrentLeaderMargin'),
                {
                  kind: 'seatAgg',
                  over: { role: 'currentLeader' },
                  expr: currentVictoryMarginSeat,
                  aggOp: 'sum',
                  availability: 'selfAndTargetReady',
                },
              ],
            },
            literal(0),
          ],
        }),
      },
      planOrder: ['projectedCurrentLeaderMargin', 'projectedLeaderMarginDelta'],
    });
    assert.equal(coverageOf(verdicts, 'projectedCurrentLeaderMargin')?.coverage, 'wasm-row');
    const delta = coverageOf(verdicts, 'projectedLeaderMarginDelta');
    assert.equal(delta?.coverage, 'ts-oracle');
    // Both the nested role-selected seatAgg and its inner currentSurface leaf are
    // pre-ticket-003 blockers; the classifier reports the first one it reaches.
    assert.match(delta?.reason ?? '', /role-selected seatAgg|currentSurface/u);
  });

  it('classifies a previewRelationship feature as ts-oracle with the preview-relationship reason (projectedAllyMarginDelta shape)', () => {
    const verdicts = classify({
      candidateFeatures: {
        projectedAllyMarginDelta: previewFeature({
          kind: 'op',
          op: 'coalesce',
          args: [
            { kind: 'ref', ref: { kind: 'previewRelationship', role: 'nominalAlly', field: 'gainValueDelta' } },
            literal(0),
          ],
        }),
      },
      planOrder: ['projectedAllyMarginDelta'],
    });
    const verdict = coverageOf(verdicts, 'projectedAllyMarginDelta');
    assert.equal(verdict?.coverage, 'ts-oracle');
    assert.equal(verdict?.reason, 'preview-relationship requires preview-state role resolution');
  });

  it('classifies a previewStateFeature ref shape as wasm-row', () => {
    const verdicts = classify({
      candidateFeatures: {
        projectedSupportDelta: previewFeature({
          kind: 'op',
          op: 'coalesce',
          args: [
            {
              kind: 'op',
              op: 'sub',
              args: [previewStateFeatureRef('totalSupport'), stateFeatureRef('totalSupport')],
            },
            literal(0),
          ],
        }),
      },
      stateFeatures: {
        totalSupport: { type: 'number', costClass: 'candidate', expr: literal(0), dependencies: emptyDeps },
      } as unknown as AgentPolicyCatalog['compiled']['stateFeatures'],
      planOrder: ['projectedSupportDelta'],
    });
    assert.equal(coverageOf(verdicts, 'projectedSupportDelta')?.coverage, 'wasm-row');
  });

  it('classifies a previewSurface + stateFeature coalesce as wasm-row (projectedSelfMargin shape)', () => {
    const verdicts = classify({
      candidateFeatures: {
        projectedSelfMargin: previewFeature({
          kind: 'op',
          op: 'coalesce',
          args: [previewVictoryMarginSelf, stateFeatureRef('selfMargin')],
        }),
      },
      stateFeatures: {
        selfMargin: { type: 'number', costClass: 'candidate', expr: literal(0), dependencies: emptyDeps },
      } as unknown as AgentPolicyCatalog['compiled']['stateFeatures'],
      planOrder: ['projectedSelfMargin'],
    });
    assert.equal(coverageOf(verdicts, 'projectedSelfMargin')?.coverage, 'wasm-row');
  });

  it('classifies a currentSurface globalVar delta as ts-oracle (projectedAidDelta shape)', () => {
    const verdicts = classify({
      candidateFeatures: {
        projectedAidDelta: previewFeature({
          kind: 'op',
          op: 'coalesce',
          args: [
            { kind: 'op', op: 'sub', args: [previewGlobalAid, currentGlobalAid] },
            literal(0),
          ],
        }),
      },
      planOrder: ['projectedAidDelta'],
    });
    const verdict = coverageOf(verdicts, 'projectedAidDelta');
    assert.equal(verdict?.coverage, 'ts-oracle');
    assert.match(verdict?.reason ?? '', /currentSurface/u);
  });

  it('classifies a feature with an unsupported operator as ts-oracle', () => {
    for (const op of ['clamp', 'if', 'in', 'scheduleLowerBound'] as const) {
      const verdicts = classify({
        candidateFeatures: {
          unsupported: previewFeature({
            kind: 'op',
            op: 'coalesce',
            args: [
              { kind: 'op', op, args: [previewVictoryMarginSelf, literal(0)] },
              literal(0),
            ],
          }),
        },
        planOrder: ['unsupported'],
      });
      const verdict = coverageOf(verdicts, 'unsupported');
      assert.equal(verdict?.coverage, 'ts-oracle', `operator ${op} must route to oracle`);
      assert.match(verdict?.reason ?? '', new RegExp(op, 'u'));
    }
  });

  it('inherits ts-oracle through a cross-ref and wasm-row through a covered cross-ref (plan-order dependency)', () => {
    const verdicts = classify({
      candidateFeatures: {
        // ts-oracle producer (previewRelationship).
        oracleSource: previewFeature({
          kind: 'op',
          op: 'coalesce',
          args: [
            { kind: 'ref', ref: { kind: 'previewRelationship', role: 'nominalAlly', field: 'gainValueDelta' } },
            literal(0),
          ],
        }),
        // wasm-row producer.
        wasmSource: previewFeature({
          kind: 'op',
          op: 'coalesce',
          args: [previewVictoryMarginSelf, literal(0)],
        }),
        dependsOnOracle: previewFeature({
          kind: 'op',
          op: 'sub',
          args: [candidateFeatureRef('oracleSource'), literal(0)],
        }),
        dependsOnWasm: previewFeature({
          kind: 'op',
          op: 'sub',
          args: [candidateFeatureRef('wasmSource'), literal(0)],
        }),
      },
      planOrder: ['oracleSource', 'wasmSource', 'dependsOnOracle', 'dependsOnWasm'],
    });
    assert.equal(coverageOf(verdicts, 'oracleSource')?.coverage, 'ts-oracle');
    assert.equal(coverageOf(verdicts, 'wasmSource')?.coverage, 'wasm-row');
    const dependsOnOracle = coverageOf(verdicts, 'dependsOnOracle');
    assert.equal(dependsOnOracle?.coverage, 'ts-oracle');
    assert.match(dependsOnOracle?.reason ?? '', /depends on TS-oracle candidate feature "oracleSource"/u);
    assert.equal(coverageOf(verdicts, 'dependsOnWasm')?.coverage, 'wasm-row');
  });

  it('treats a forward/unresolved candidate cross-ref as ts-oracle (cross-ref ordering)', () => {
    const verdicts = classify({
      candidateFeatures: {
        // References a feature that is classified LATER in plan order.
        dependsOnLater: previewFeature({
          kind: 'op',
          op: 'sub',
          args: [candidateFeatureRef('laterWasm'), literal(0)],
        }),
        laterWasm: previewFeature({
          kind: 'op',
          op: 'coalesce',
          args: [previewVictoryMarginSelf, literal(0)],
        }),
      },
      planOrder: ['dependsOnLater', 'laterWasm'],
    });
    assert.equal(coverageOf(verdicts, 'dependsOnLater')?.coverage, 'ts-oracle');
    assert.equal(coverageOf(verdicts, 'laterWasm')?.coverage, 'wasm-row');
  });

  it('skips non-preview candidate features and yields an empty verdict list for a zero-preview profile', () => {
    const verdicts = classify({
      candidateFeatures: {
        cheapOne: cheapFeature(stateFeatureRef('selfMargin')),
        cheapTwo: cheapFeature(literal(1)),
      },
      planOrder: ['cheapOne', 'cheapTwo'],
    });
    assert.deepEqual(verdicts, []);
  });

  it('is deterministic and order-stable across repeated runs', () => {
    const input: HarnessInput = {
      candidateFeatures: {
        a: previewFeature({ kind: 'op', op: 'coalesce', args: [previewVictoryMarginSelf, literal(0)] }),
        b: previewFeature({
          kind: 'op',
          op: 'coalesce',
          args: [currentGlobalAid, literal(0)],
        }),
      },
      planOrder: ['a', 'b'],
    };
    assert.deepEqual(classify(input), classify(input));
  });
});
