import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveProbeResult,
  type ProbeResult,
  type ProbeResultPolicy,
} from '../../../src/kernel/probe-result.js';

describe('resolveProbeResult', () => {
  const trackingPolicy: ProbeResultPolicy<number, string> = {
    onLegal: (value) => `legal:${value}`,
    onIllegal: () => 'illegal',
    onInconclusive: (reason) => `inconclusive:${reason ?? 'none'}`,
  };

  it('calls onLegal with the value for a legal result', () => {
    const result: ProbeResult<number> = { outcome: 'legal', value: 42 };
    assert.equal(resolveProbeResult(result, trackingPolicy), 'legal:42');
  });

  it('calls onIllegal for an illegal result', () => {
    const result: ProbeResult<number> = { outcome: 'illegal' };
    assert.equal(resolveProbeResult(result, trackingPolicy), 'illegal');
  });

  it('calls onInconclusive with reason for an inconclusive result with reason', () => {
    const result: ProbeResult<number> = {
      outcome: 'inconclusive',
      reason: 'missingBinding',
    };
    assert.equal(
      resolveProbeResult(result, trackingPolicy),
      'inconclusive:missingBinding',
    );
  });

  it('calls onInconclusive with undefined for an inconclusive result without reason', () => {
    const result: ProbeResult<number> = { outcome: 'inconclusive' };
    assert.equal(
      resolveProbeResult(result, trackingPolicy),
      'inconclusive:none',
    );
  });

  it('passes each ProbeInconclusiveReason correctly', () => {
    const reasons = [
      'ownerMismatch',
      'missingBinding',
      'stackingViolation',
      'selectorCardinality',
    ] as const;
    for (const reason of reasons) {
      const result: ProbeResult<number> = { outcome: 'inconclusive', reason };
      assert.equal(
        resolveProbeResult(result, trackingPolicy),
        `inconclusive:${reason}`,
      );
    }
  });
});

describe('ProbeResult discriminated union type narrowing', () => {
  it('narrows value to T in the legal branch (compile-time verification)', () => {
    // Cast prevents TypeScript from narrowing the literal to a single-variant union.
    const result = { outcome: 'legal', value: 99 } as ProbeResult<number>;
    if (result.outcome === 'legal') {
      // If DU narrowing is broken, this line would require a non-null assertion
      // and tsc would emit an error when strict null checks are enabled.
      const val: number = result.value;
      assert.equal(val, 99);
    } else {
      assert.fail('Expected legal outcome');
    }
  });

  it('narrows reason to ProbeInconclusiveReason | undefined in the inconclusive branch', () => {
    const result = {
      outcome: 'inconclusive',
      reason: 'ownerMismatch',
    } as ProbeResult<number>;
    if (result.outcome === 'inconclusive') {
      const r: string | undefined = result.reason;
      assert.equal(r, 'ownerMismatch');
    } else {
      assert.fail('Expected inconclusive outcome');
    }
  });
});
