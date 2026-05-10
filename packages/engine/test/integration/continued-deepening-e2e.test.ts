// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

import {
  capturePreview,
  createProfile,
  runPolicyTrace,
} from '../architecture/preview-deepening/continued-deepening-fixture.js';

type CompiledFixtureProfile = ReturnType<typeof createProfile>;

interface FixtureProfile {
  readonly profileId: string;
  readonly preview: CompiledFixtureProfile['preview'];
  readonly considerations: readonly {
    readonly id: string;
    readonly scopes: readonly string[];
    readonly valueRef: string;
    readonly previewFallback: { readonly onUnavailable: string };
  }[];
}

const here = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot(): string {
  let cursor = here;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = resolve(cursor, '..');
  }
  return process.cwd();
}

const fixturePath = join(
  resolveRepoRoot(),
  'packages',
  'engine',
  'test',
  'fixtures',
  'preview-deepening-e2e',
  'profile.yaml',
);

function loadFixtureProfile(): FixtureProfile {
  const document = parseDocument(readFileSync(fixturePath, 'utf8'), {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
  });
  assert.deepEqual(document.errors, []);
  return document.toJSON() as FixtureProfile;
}

function compileFixtureProfile(fixture: FixtureProfile): CompiledFixtureProfile {
  const profile = createProfile('continuedDeepening');
  const considerationIds = fixture.considerations.map((consideration) => consideration.id);
  return {
    ...profile,
    fingerprint: fixture.profileId,
    preview: fixture.preview,
    use: {
      ...profile.use,
      considerations: considerationIds,
    },
    plan: {
      ...profile.plan,
      considerations: considerationIds,
    },
  };
}

describe('continued deepening e2e fixture', () => {
  it('round-trips profile fixture through compile, run, and trace coverage', () => {
    const fixture = loadFixtureProfile();
    const fixtureProfile = compileFixtureProfile(fixture);
    const compiledInner = fixtureProfile.preview.inner;
    const fixtureInner = fixture.preview.inner;
    if (fixtureInner === undefined || fixtureInner.continuedDeepening === undefined) {
      throw new Error('fixture expected continuedDeepening inner preview config');
    }

    assert.equal(fixture.profileId, 'continued-deepening-e2e');
    assert.equal(fixtureInner.strategy, compiledInner?.strategy);
    assert.equal(fixtureInner.capClass, compiledInner?.capClass);
    assert.equal(fixtureInner.depthCap, compiledInner?.depthCap);
    assert.equal(fixtureInner.maxOptions, compiledInner?.maxOptions);
    assert.equal(fixtureInner.chooseNBeamWidth, compiledInner?.chooseNBeamWidth);
    assert.equal(
      fixtureInner.continuedDeepening.deep.trigger[0],
      compiledInner?.continuedDeepening?.deep.trigger[0],
    );
    assert.equal(fixture.considerations[0]?.valueRef, 'preview.option.delta.victory.currentMargin.self');
    assert.equal(fixture.considerations[0]?.previewFallback.onUnavailable, 'noContribution');
    assert.deepEqual(fixtureProfile.use.considerations, ['preferProjectedMargin']);

    const preview = capturePreview('continuedDeepening');
    assert.equal(preview.usage.coverage.strategy, 'continuedDeepening');
    assert.equal(preview.usage.coverage.capClass, 'deep1024');
    assert.ok(preview.usage.coverage.broad, 'expected broad coverage block');
    assert.ok(preview.usage.coverage.deep, 'expected deep coverage block');
    assert.equal(preview.usage.coverage.deep?.triggerFired, 'allRequestedRefsDepthCapped');
    assert.ok(
      (preview.usage.coverage.broad?.unavailableRootOptionCount ?? 0) > 0,
      'expected broad phase to expose unavailable roots',
    );
    assert.ok(
      (preview.usage.coverage.deep?.readyRootOptionCount ?? 0) > 0,
      'expected deep phase to recover ready roots',
    );
    assert.ok(
      preview.usage.coverage.readyRootOptionCount > 0,
      'expected merged coverage to contain ready roots',
    );

    const trace = runPolicyTrace('continuedDeepening', (catalog) => {
      Object.assign(catalog.profiles, { baseline: fixtureProfile });
    });
    assert.equal(trace.previewUsage.coverage.strategy, 'continuedDeepening');
    assert.ok(trace.previewUsage.coverage.broad, 'trace should include broad coverage');
    assert.ok(trace.previewUsage.coverage.deep, 'trace should include deep coverage');
    assert.equal(trace.previewUsage.coverage.deep?.triggerFired, 'allRequestedRefsDepthCapped');
    assert.equal(trace.previewUsage.coverage.selectedByTieBreakerBecausePreviewUnavailable, false);
    assert.equal(
      trace.advisories?.some((entry) => entry.code === 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE') ?? false,
      false,
    );
  });
});
