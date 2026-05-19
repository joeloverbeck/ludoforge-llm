// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGuardrailTrace } from '../../../src/agents/policy-guardrail-trace.js';
import type { PolicyGuardrailTrace } from '../../../src/kernel/types.js';

const fired = (index: number): PolicyGuardrailTrace['fired'][number] => ({
  id: `guardrail${index}`,
  traceLabel: `guardrail ${index}`,
  severity: 'demote',
  penalty: index,
  status: 'ready',
});

const notFired = (index: number): PolicyGuardrailTrace['notFiredTop'][number] => ({
  id: `notFired${index}`,
  reason: 'whenFalse',
});

const entries = () => ({
  fired: [1, 2, 3, 4, 5, 6].map(fired),
  notFired: [1, 2, 3, 4, 5, 6].map(notFired),
});

describe('guardrail trace caps', () => {
  it('caps summary mode at three fired and three not-fired entries', () => {
    const trace = buildGuardrailTrace({ ...entries(), traceLevel: 'summary' });

    assert.equal(trace?.fired.length, 3);
    assert.equal(trace?.notFiredTop.length, 3);
  });

  it('lifts verbose mode to the established top-K budget and emits full debug trace', () => {
    const verbose = buildGuardrailTrace({ ...entries(), traceLevel: 'verbose' });
    const debug = buildGuardrailTrace({ ...entries(), traceLevel: 'debug' });

    assert.equal(verbose?.fired.length, 5);
    assert.equal(verbose?.notFiredTop.length, 5);
    assert.equal(debug?.fired.length, 6);
    assert.equal(debug?.notFiredTop.length, 6);
  });

  it('preserves allPrunedFallback when every list is capped or empty', () => {
    const fallback = {
      guardrailId: 'dropEverything',
      actionId: 'pass',
      traceLabel: 'take pass fallback',
    };
    const trace = buildGuardrailTrace({
      fired: [],
      notFired: [],
      allPrunedFallback: fallback,
      traceLevel: 'summary',
    });

    assert.deepEqual(trace?.allPrunedFallback, fallback);
  });
});
