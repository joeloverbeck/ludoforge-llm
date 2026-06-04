// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlImmediateWinCase, withEveryZoneSupportMarker } from './shared-competence-helpers.js';

describe('ARVN shared.immediateWin witness', () => {
  it('selects a non-pass root while the ARVN self-margin improves', () => {
    assertFitlImmediateWinCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'arvn-baseline',
      seatId: 'arvn',
      playerIndex: 1,
      seed: 1,
      expectedRootStableMoveKey: 'govern|{}|noCompound|false|specialActivity',
      selfMarginAssertion: {
        label: 'ARVN self margin',
        query: { kind: 'terminalVictoryMargin', seat: 'arvn' },
        before: 0,
        after: 1,
        delta: { exact: 1 },
      },
      prepareState: (def, state) => {
        const prepared = withEveryZoneSupportMarker(def, state, 'activeSupport');
        return {
          ...prepared,
          globalVars: {
            ...prepared.globalVars,
            patronage: 30,
          },
        };
      },
    });
  });
});
