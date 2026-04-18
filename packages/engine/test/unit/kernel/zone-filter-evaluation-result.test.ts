// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  zoneFilterResolved,
  zoneFilterDeferred,
  zoneFilterFailed,
  resolveZoneFilterEvaluationResult,
  type ZoneFilterEvaluationResult,
  type ZoneFilterEvaluationResultPolicy,
} from '../../../src/kernel/zone-filter-evaluation-result.js';

describe('ZoneFilterEvaluationResult factory functions', () => {
  it('zoneFilterResolved creates a resolved result with matched=true', () => {
    const result = zoneFilterResolved(true);
    assert.equal(result.status, 'resolved');
    assert.equal(result.matched, true);
  });

  it('zoneFilterResolved creates a resolved result with matched=false', () => {
    const result = zoneFilterResolved(false);
    assert.equal(result.status, 'resolved');
    assert.equal(result.matched, false);
  });

  it('zoneFilterDeferred creates a deferred result with missingBinding', () => {
    const result = zoneFilterDeferred('missingBinding');
    assert.equal(result.status, 'deferred');
    assert.equal(result.reason, 'missingBinding');
  });

  it('zoneFilterDeferred creates a deferred result with missingVar', () => {
    const result = zoneFilterDeferred('missingVar');
    assert.equal(result.status, 'deferred');
    assert.equal(result.reason, 'missingVar');
  });

  it('zoneFilterFailed creates a failed result with the error', () => {
    const error = new Error('eval failed');
    const result = zoneFilterFailed(error);
    assert.equal(result.status, 'failed');
    assert.equal(result.error, error);
  });

  it('zoneFilterFailed preserves non-Error values', () => {
    const result = zoneFilterFailed('string-error');
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'string-error');
  });
});

describe('ZoneFilterEvaluationResult discriminated union type narrowing', () => {
  it('narrows matched to boolean in the resolved branch', () => {
    const result = { status: 'resolved', matched: true } as ZoneFilterEvaluationResult;
    if (result.status === 'resolved') {
      const m: boolean = result.matched;
      assert.equal(m, true);
    } else {
      assert.fail('Expected resolved status');
    }
  });

  it('narrows reason to ZoneFilterDeferralReason in the deferred branch', () => {
    const result = {
      status: 'deferred',
      reason: 'missingBinding',
    } as ZoneFilterEvaluationResult;
    if (result.status === 'deferred') {
      const r: string = result.reason;
      assert.equal(r, 'missingBinding');
    } else {
      assert.fail('Expected deferred status');
    }
  });

  it('narrows error to unknown in the failed branch', () => {
    const err = new Error('fail');
    const result = { status: 'failed', error: err } as ZoneFilterEvaluationResult;
    if (result.status === 'failed') {
      assert.equal(result.error, err);
    } else {
      assert.fail('Expected failed status');
    }
  });
});

describe('resolveZoneFilterEvaluationResult', () => {
  const trackingPolicy: ZoneFilterEvaluationResultPolicy<string> = {
    onResolved: (matched) => `resolved:${matched}`,
    onDeferred: (reason) => `deferred:${reason}`,
    onFailed: (error) => `failed:${String(error)}`,
  };

  it('calls onResolved with matched for a resolved result', () => {
    const result: ZoneFilterEvaluationResult = { status: 'resolved', matched: true };
    assert.equal(resolveZoneFilterEvaluationResult(result, trackingPolicy), 'resolved:true');
  });

  it('calls onResolved with matched=false', () => {
    const result: ZoneFilterEvaluationResult = { status: 'resolved', matched: false };
    assert.equal(resolveZoneFilterEvaluationResult(result, trackingPolicy), 'resolved:false');
  });

  it('calls onDeferred with reason for a deferred result', () => {
    const result: ZoneFilterEvaluationResult = { status: 'deferred', reason: 'missingBinding' };
    assert.equal(resolveZoneFilterEvaluationResult(result, trackingPolicy), 'deferred:missingBinding');
  });

  it('calls onDeferred with missingVar reason', () => {
    const result: ZoneFilterEvaluationResult = { status: 'deferred', reason: 'missingVar' };
    assert.equal(resolveZoneFilterEvaluationResult(result, trackingPolicy), 'deferred:missingVar');
  });

  it('calls onFailed with error for a failed result', () => {
    const error = new Error('boom');
    const result: ZoneFilterEvaluationResult = { status: 'failed', error };
    assert.equal(resolveZoneFilterEvaluationResult(result, trackingPolicy), `failed:Error: boom`);
  });
});
