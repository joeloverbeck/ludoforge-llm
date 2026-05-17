// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../../helpers/production-spec-helpers.js';

describe('preview outcomeGrantContinuation back compatibility', () => {
  it('keeps existing production profiles opted out by default', () => {
    for (const compile of [compileProductionSpec, compileTexasProductionSpec] as const) {
      const { parsed, compiled } = compile();
      assertNoErrors(parsed);
      assertNoErrors(compiled);

      for (const profile of Object.values(compiled.gameDef.agents?.profiles ?? {})) {
        const continuation = profile.preview.outcomeGrantContinuation;
        assert.equal(
          continuation === undefined || continuation.enabled === false,
          true,
          `${profile.fingerprint} should not opt into outcomeGrantContinuation by default`,
        );
      }
    }
  });
});
