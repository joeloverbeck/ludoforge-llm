// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../../helpers/production-spec-helpers.js';

describe('preview outcomeGrantContinuation back compatibility', () => {
  it('keeps production profiles opted out by default except the explicit ARVN witness profile', () => {
    for (const [family, compile] of [['fitl', compileProductionSpec], ['texas', compileTexasProductionSpec]] as const) {
      const { parsed, compiled } = compile();
      assertNoErrors(parsed);
      assertNoErrors(compiled);

      for (const [profileId, profile] of Object.entries(compiled.gameDef.agents?.profiles ?? {})) {
        const continuation = profile.preview.outcomeGrantContinuation;
        if (family === 'fitl' && profileId === 'arvn-evolved') {
          assert.deepEqual(
            continuation,
            { enabled: true, extraDepthCap: 4, capClass: 'postGrant16' },
            'arvn-evolved intentionally retains the Spec 179 red-witness opt-in substrate',
          );
          continue;
        }
        assert.equal(
          continuation === undefined || continuation.enabled === false,
          true,
          `${profile.fingerprint} should not opt into outcomeGrantContinuation by default`,
        );
      }
    }
  });
});
