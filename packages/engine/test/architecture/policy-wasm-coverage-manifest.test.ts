// @test-class: architectural-invariant
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyCandidateFeatureCoverage } from '../../src/agents/index.js';
import { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } from '../../src/cnl/index.js';
import {
  assertValidatedGameDef,
  type AgentPolicyCatalog,
  type CompiledPolicyExpr,
  type GameDef,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

/*
 * Spec 206 §4.1 / §6 P0 — WASM candidate-feature coverage guard.
 *
 * This standing architectural-invariant test recomputes `classifyCandidateFeatureCoverage`
 * for every profile of every conformance-corpus game with an agent catalog and
 * asserts the verdicts equal the checked-in manifest. A diff means a production
 * profile's preview-cost candidate-feature coverage changed (a new ref family,
 * a re-shaped expr, a materializability extension) — review must consciously
 * accept it (extend WASM, or accept TS-oracle) and re-bless the manifest. This
 * converts "silent acceleration loss" (the PR #291 failure mode) into a
 * reviewable manifest diff.
 *
 * The manifest is keyed per-(profileId, featureExprFingerprint) (§11.1): coverage
 * is a deterministic function of the compiled feature expr plus the route's
 * materializability predicates, NOT the rest of the GameDef, so fingerprinting
 * the expr re-blesses exactly when coverage can change and avoids churn on every
 * unrelated GameDef shift. The fingerprint is the SHA-256 of the canonical
 * (recursively key-sorted) JSON of the compiled candidate-feature expr.
 *
 * The classifier is static (no game execution, no WASM module), so this test
 * belongs in the fast default lane (§11.2). The corpus spans FITL plus the
 * non-FITL games `generic-control` and `texas-holdem`, whose `preview: disabled`
 * profiles emit zero entries — proving the classifier runs game-agnostically
 * (Foundation #1, §11.3).
 */

const resolveRepoRoot = (): string => {
  let cursor = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
};

const REPO_ROOT = resolveRepoRoot();
const FIXTURE_PATH = join(REPO_ROOT, 'packages', 'engine', 'test', 'fixtures', 'policy-wasm', 'candidate-feature-coverage.json');
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1';

interface ManifestVerdict {
  readonly id: string;
  readonly coverage: 'wasm-row' | 'ts-oracle';
  readonly reason: string;
  readonly featureExprFingerprint: string;
}

type ProfileManifest = Readonly<Record<string, readonly ManifestVerdict[]>>;
type CoverageManifest = Readonly<Record<string, ProfileManifest>>;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === 'object' && value !== null) {
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      ordered[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return ordered;
  }
  return value;
};

const featureExprFingerprint = (expr: CompiledPolicyExpr): string =>
  createHash('sha256').update(JSON.stringify(canonicalize(expr))).digest('hex').slice(0, 16);

const compileGenericControl = (): ValidatedGameDef => {
  const entrypoint = join(REPO_ROOT, 'data', 'games', 'generic-control.game-spec.md');
  const staged = runGameSpecStagesFromBundle(loadGameSpecBundleFromEntrypoint(entrypoint));
  assert.equal(staged.validation.blocked, false);
  assert.equal(staged.compilation.blocked, false);
  assert.ok(staged.compilation.result?.gameDef, 'generic-control must compile to a GameDef');
  return assertValidatedGameDef(staged.compilation.result.gameDef);
};

const compileFitl = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  return assertValidatedGameDef(compiled.gameDef);
};

const compileTexas = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  return assertValidatedGameDef(compiled.gameDef);
};

const CORPUS: readonly { readonly name: string; readonly compile: () => GameDef }[] = [
  { name: 'fire-in-the-lake', compile: compileFitl },
  { name: 'generic-control', compile: compileGenericControl },
  { name: 'texas-holdem', compile: compileTexas },
];

const profileManifestFor = (def: GameDef, catalog: AgentPolicyCatalog): ProfileManifest => {
  const manifest: Record<string, readonly ManifestVerdict[]> = {};
  for (const profileId of Object.keys(catalog.profiles).sort()) {
    const profile = catalog.profiles[profileId]!;
    const verdicts = classifyCandidateFeatureCoverage({ profile, catalog, def });
    manifest[profileId] = verdicts
      .map((verdict): ManifestVerdict => ({
        id: verdict.id,
        coverage: verdict.coverage,
        reason: verdict.reason,
        featureExprFingerprint: featureExprFingerprint(catalog.compiled.candidateFeatures[verdict.id]!.expr),
      }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }
  return manifest;
};

const computeManifest = (): CoverageManifest => {
  const manifest: Record<string, ProfileManifest> = {};
  for (const { name, compile } of CORPUS) {
    const def = compile();
    const catalog = def.agents;
    assert.ok(catalog, `${name} must define an agent catalog for the coverage corpus`);
    manifest[name] = profileManifestFor(def, catalog);
  }
  return manifest;
};

describe('Spec 206 WASM candidate-feature coverage manifest', () => {
  it('matches the checked-in coverage manifest across the conformance corpus', () => {
    const actual = computeManifest();
    if (UPDATE_GOLDEN) {
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    let expected: CoverageManifest;
    try {
      expected = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as CoverageManifest;
    } catch {
      assert.fail(`Missing coverage manifest at ${FIXTURE_PATH}; rerun with UPDATE_GOLDEN=1 to bless intentionally.`);
    }
    assert.deepEqual(
      actual,
      expected,
      'WASM candidate-feature coverage changed; review the diff and rerun with UPDATE_GOLDEN=1 to bless intentionally.',
    );
  });

  it('recomputes byte-identically on a second pass (determinism, Foundation #8/#16)', () => {
    assert.deepEqual(computeManifest(), computeManifest());
  });

  it('emits zero entries for the zero-preview non-FITL conformance games (agnostic classifier path)', () => {
    for (const name of ['generic-control', 'texas-holdem'] as const) {
      const def = CORPUS.find((entry) => entry.name === name)!.compile();
      const catalog = def.agents;
      assert.ok(catalog, `${name} must define an agent catalog`);
      const manifest = profileManifestFor(def, catalog);
      for (const [profileId, verdicts] of Object.entries(manifest)) {
        assert.deepEqual(verdicts, [], `${name}/${profileId} must classify zero preview-cost candidate features`);
      }
    }
  });

  it('forces a manifest diff when a synthetic preview.relationship feature is injected (P0 forcing function)', () => {
    const def = compileFitl();
    const catalog = def.agents;
    assert.ok(catalog, 'FITL must define an agent catalog');
    const [profileId, profile] = Object.entries(catalog.profiles)[0]!;
    const syntheticId = '__synthetic_preview_relationship__';
    const syntheticExpr: CompiledPolicyExpr = {
      kind: 'op',
      op: 'coalesce',
      args: [
        { kind: 'ref', ref: { kind: 'previewRelationship', role: 'nominalAlly', field: 'gainValueDelta' } },
        { kind: 'literal', value: 0 },
      ],
    };
    const mutatedCatalog = {
      ...catalog,
      compiled: {
        ...catalog.compiled,
        candidateFeatures: {
          ...catalog.compiled.candidateFeatures,
          [syntheticId]: {
            type: 'number',
            costClass: 'preview',
            expr: syntheticExpr,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
        },
      },
    } as unknown as AgentPolicyCatalog;
    const mutatedProfile = {
      ...profile,
      plan: { ...profile.plan, candidateFeatures: [...profile.plan.candidateFeatures, syntheticId] },
    };
    const verdicts = classifyCandidateFeatureCoverage({ profile: mutatedProfile, catalog: mutatedCatalog, def });
    const injected = verdicts.find((verdict) => verdict.id === syntheticId);
    assert.equal(injected?.coverage, 'ts-oracle');
    assert.equal(injected?.reason, 'preview-relationship requires preview-state role resolution');
    // The injected verdict is absent from the checked-in manifest, so the guard
    // above would fail until re-blessed — the forcing function.
    const expected = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as CoverageManifest;
    const recorded = (expected['fire-in-the-lake']?.[profileId] ?? []).some((entry) => entry.id === syntheticId);
    assert.equal(recorded, false, 'synthetic feature must not already be in the manifest');
  });
});
