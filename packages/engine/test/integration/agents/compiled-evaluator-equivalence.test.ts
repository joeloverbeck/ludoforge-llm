// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectCompiledConsiderationSamples,
  evaluateAstConsiderationSample,
  evaluateCompiledConsiderationSample,
  loadCompiledPolicyFixtures,
  summarizeCompiledPolicyCoverage,
} from '../../helpers/compiled-policy-production-helpers.js';

describe('compiled policy evaluator scaffold', () => {
  it('emits descriptor coverage for the first supported expression families', () => {
    const fixtures = loadCompiledPolicyFixtures();
    const coverage = summarizeCompiledPolicyCoverage(fixtures);

    assert.ok(coverage.totalConsiderations > 0, 'expected production policy considerations');
    assert.ok(coverage.compiledConsiderations > 0, 'expected at least one compiled consideration descriptor');
    assert.ok((coverage.expressionKinds.literal ?? 0) > 0, 'expected literal descriptors');
    assert.ok((coverage.expressionKinds.param ?? 0) > 0, 'expected param descriptors');
    assert.ok((coverage.expressionKinds.ref ?? 0) > 0, 'expected ref descriptors');
    assert.ok((coverage.expressionKinds.op ?? 0) > 0, 'expected op descriptors');
  });

  it('matches interpreted consideration scores for the compiled descriptor subset', () => {
    const fixtures = loadCompiledPolicyFixtures();
    const samples = collectCompiledConsiderationSamples(fixtures);

    assert.ok(samples.length > 0, 'expected compiled consideration samples');

    for (const fixture of fixtures) {
      const catalog = fixture.def.agents;
      assert.ok(catalog, `${fixture.label} should compile an agent catalog`);
      for (const sample of samples.filter((entry) => entry.fixtureLabel === fixture.label)) {
        const astScore = evaluateAstConsiderationSample(fixture.def, catalog, sample);
        const compiledScore = evaluateCompiledConsiderationSample(fixture.def, catalog, sample);
        assert.equal(
          compiledScore,
          astScore,
          `${fixture.label}/${sample.profileId}/${sample.considerationId} compiled score should match AST score`,
        );
      }
    }
  });
});
