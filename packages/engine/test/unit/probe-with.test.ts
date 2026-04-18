// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { probeWith, type ProbeResult } from '../../src/kernel/index.js';

describe('probeWith', () => {
  it('returns a legal ProbeResult when fn succeeds', () => {
    const result = probeWith(
      () => 42,
      () => null,
    );
    assert.deepStrictEqual(result, { outcome: 'legal', value: 42 });
  });

  it('returns the classifier result when fn throws a classified error', () => {
    const classifiedResult: ProbeResult<never> = {
      outcome: 'inconclusive',
      reason: 'missingBinding',
    };
    const result = probeWith(
      (): string => { throw new Error('classified'); },
      (error) => {
        if (error instanceof Error && error.message === 'classified') {
          return classifiedResult;
        }
        return null;
      },
    );
    assert.deepStrictEqual(result, classifiedResult);
  });

  it('returns illegal ProbeResult when classifier returns illegal', () => {
    const illegalResult: ProbeResult<never> = {
      outcome: 'illegal',
      reason: 'ownerMismatch',
    };
    const result = probeWith(
      (): number => { throw new Error('illegal-error'); },
      () => illegalResult,
    );
    assert.deepStrictEqual(result, illegalResult);
  });

  it('re-throws when the classifier returns null', () => {
    const originalError = new Error('unclassified');
    assert.throws(
      () => probeWith(
        () => { throw originalError; },
        () => null,
      ),
      (thrown) => thrown === originalError,
    );
  });

  it('preserves the generic type from fn', () => {
    const result = probeWith(
      () => ({ x: 1, y: 'hello' }),
      () => null,
    );
    assert.equal(result.outcome, 'legal');
    if (result.outcome === 'legal') {
      assert.deepStrictEqual(result.value, { x: 1, y: 'hello' });
    }
  });
});
