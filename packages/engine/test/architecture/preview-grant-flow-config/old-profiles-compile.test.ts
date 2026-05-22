// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../../helpers/diagnostic-helpers.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../../helpers/production-spec-helpers.js';

describe('preview grantFlowContinuation production profile migration', () => {
  it('keeps production profiles opted out by default except the explicit ARVN witness profile', () => {
    for (const [family, compile] of [['fitl', compileProductionSpec], ['texas', compileTexasProductionSpec]] as const) {
      const { parsed, compiled } = compile();
      assertNoErrors(parsed);
      assertNoErrors(compiled);

      for (const [profileId, profile] of Object.entries(compiled.gameDef.agents?.profiles ?? {})) {
        const continuation = profile.preview.grantFlowContinuation;
        if (family === 'fitl' && profileId === 'arvn-baseline') {
          assert.deepEqual(
            continuation,
            {
              enabled: true,
              postGrantDepthCap: 4,
              postGrantCapClass: 'postGrant16',
              freeOperationDepthCap: 16,
              freeOperationCapClass: 'grantFlow16',
            },
            'arvn-baseline intentionally retains the Spec 179 red-witness opt-in substrate',
          );
          continue;
        }
        assert.equal(
          continuation === undefined || continuation.enabled === false,
          true,
          `${profile.fingerprint} should not opt into grantFlowContinuation by default`,
        );
      }
    }
  });
});
