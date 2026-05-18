// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProbeAssertion } from '../probe-types.js';
import { dispatchAssertion } from './index.js';
import { match, testProbe } from './assertion-test-helpers.js';

describe('probe assertion dispatcher', () => {
  it('routes every assertion kind to a registered evaluator', () => {
    const assertions: readonly ProbeAssertion[] = [
      { kind: 'selectedCandidateHasTag', tag: 'move' },
      { kind: 'selectedCandidateLacksTag', tag: 'other' },
      { kind: 'selectedCandidateRankWithinTopK', k: 1 },
      { kind: 'selectedTargetSatisfiesSelector', selector: 'target-quality' },
      { kind: 'selectedSeatTargetMatchesRole', role: 'currentLeader' },
      { kind: 'previewRefStatusIn', ref: 'missing', allowed: ['failed'] },
      { kind: 'selectedNotByReason', reason: 'fallbackExplicit' },
      { kind: 'actionFamilyDistributionBelow', family: 'any', threshold: 1, windowMinDecisions: 1 },
      { kind: 'traceContainsField', field: 'previewUsage.mode' },
      { kind: 'traceHasAdvisory', code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE' },
      { kind: 'traceLacksAdvisory', code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE' },
      { kind: 'guardrailFired', guardrail: 'avoid-blunder' },
      { kind: 'guardrailNotFired', guardrail: 'avoid-blunder' },
    ];
    for (const assertion of assertions) {
      const occurrence = assertion.kind === 'actionFamilyDistributionBelow' ? 'every' : 'first';
      assert.match(dispatchAssertion(assertion, { probe: testProbe(assertion, occurrence), matches: [match()] }).kind, /^(pass|fail|error)$/u);
    }
  });
});
