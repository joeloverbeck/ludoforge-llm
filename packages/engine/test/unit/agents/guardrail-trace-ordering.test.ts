// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildGuardrailTrace,
  type GuardrailNotFiredTraceInput,
} from '../../../src/agents/policy-guardrail-trace.js';
import type { PolicyGuardrailTrace } from '../../../src/kernel/types.js';

const fired = (
  id: string,
  severity: PolicyGuardrailTrace['fired'][number]['severity'],
): PolicyGuardrailTrace['fired'][number] => ({
  id,
  traceLabel: `${id} label`,
  severity,
  status: 'ready',
});

const notFired = (
  id: string,
  severity: GuardrailNotFiredTraceInput['severity'],
): GuardrailNotFiredTraceInput => ({
  id,
  ...(severity === undefined ? {} : { severity }),
  reason: 'whenFalse',
});

describe('guardrail trace ordering', () => {
  it('orders fired and not-fired guardrails by severity then id', () => {
    const trace = buildGuardrailTrace({
      traceLevel: 'debug',
      fired: [
        fired('zWarn', 'warn'),
        fired('bPrune', 'prune'),
        fired('aPrune', 'prune'),
        fired('aAudit', 'auditOnly'),
        fired('aDemote', 'demote'),
      ],
      notFired: [
        notFired('zWarnNotFired', 'warn'),
        notFired('bPruneNotFired', 'prune'),
        notFired('aPruneNotFired', 'prune'),
        notFired('aDemoteNotFired', 'demote'),
      ],
    });

    assert.deepEqual(trace?.fired.map((entry) => entry.id), [
      'aPrune',
      'bPrune',
      'aDemote',
      'zWarn',
      'aAudit',
    ]);
    assert.deepEqual(trace?.notFiredTop.map((entry) => entry.id), [
      'aPruneNotFired',
      'bPruneNotFired',
      'aDemoteNotFired',
      'zWarnNotFired',
    ]);
    assert.deepEqual(trace?.notFiredTop.map((entry) => Object.hasOwn(entry, 'severity')), [
      false,
      false,
      false,
      false,
    ]);
  });

  it('produces byte-identical guardrail traces across runs', () => {
    const input = {
      traceLevel: 'debug' as const,
      fired: [
        fired('zWarn', 'warn'),
        fired('aPrune', 'prune'),
        fired('aDemote', 'demote'),
      ],
      notFired: [
        notFired('zNotFired', 'warn'),
        notFired('aNotFired', 'prune'),
      ],
    };

    assert.equal(JSON.stringify(buildGuardrailTrace(input)), JSON.stringify(buildGuardrailTrace(input)));
  });
});
