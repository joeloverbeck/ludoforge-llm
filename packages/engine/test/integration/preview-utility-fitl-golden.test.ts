// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { classifyPreviewUtility } from '../../src/agents/preview-utility-classifier.js';
import type { PolicyEvaluationPreviewUsage, PreviewUtility } from '../../src/agents/policy-eval.js';

interface PreviewUtilityGoldenFixture {
  readonly decisions: readonly {
    readonly label: string;
    readonly expectedUtility: PreviewUtility;
    readonly previewUsage: PolicyEvaluationPreviewUsage;
  }[];
}

const fixtureUrl = new URL('../../../test/fixtures/trace/preview-utility-fitl-canary.json', import.meta.url);

const loadFixture = (): PreviewUtilityGoldenFixture => JSON.parse(
  readFileSync(fixtureUrl, 'utf8'),
) as PreviewUtilityGoldenFixture;

describe('preview utility FITL golden excerpts', () => {
  it('pins the exp-002 identical-margin and differentiated utility classifications', () => {
    const fixture = loadFixture();

    assert.deepEqual(fixture.decisions.map((decision) => decision.label), [
      'IDENTICAL margins decision',
      'DIFFERENTIATED decision',
    ]);

    for (const decision of fixture.decisions) {
      assert.equal(decision.previewUsage.utility, decision.expectedUtility, decision.label);
      assert.equal(
        classifyPreviewUtility(decision.previewUsage.readyRefStats),
        decision.expectedUtility,
        decision.label,
      );
    }
  });
});
