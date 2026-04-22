// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findPatternMatches } from '../helpers/source-search-guard.js';

const RETIRED_SYMBOLS = [
  'CompletionCertificate',
  'materializeCompletionCertificate',
  'emitCompletionCertificate',
  'certificateIndex',
] as const;

const grepMatches = (pattern: string): string => {
  return findPatternMatches(new RegExp(pattern, 'u'), ['packages/engine/src']);
};

describe('Spec 140 no-certificate invariant', () => {
  it('keeps retired certificate machinery out of engine source', () => {
    for (const symbol of RETIRED_SYMBOLS) {
      assert.equal(grepMatches(symbol), '', `expected no remaining engine-source references for ${symbol}`);
    }
  });
});
