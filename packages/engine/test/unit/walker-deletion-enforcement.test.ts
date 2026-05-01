// @test-class: architectural-invariant
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const sourceRoot = existsSync('packages/engine/src') ? 'packages/engine/src' : 'src';

describe('decision-stack serialization walker enforcement (spec 151)', () => {
  it('sanitizeNestedBigInts is fully deleted from packages/engine/src', () => {
    const output = execSync(`grep -rn 'sanitizeNestedBigInts' ${sourceRoot} || true`, {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim();
    assert.equal(output, '', `Residual references to sanitizeNestedBigInts:\n${output}`);
  });

  it('restoreNestedSerializedBigInts is fully deleted from packages/engine/src', () => {
    const output = execSync(`grep -rn 'restoreNestedSerializedBigInts' ${sourceRoot} || true`, {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim();
    assert.equal(output, '', `Residual references to restoreNestedSerializedBigInts:\n${output}`);
  });
});
