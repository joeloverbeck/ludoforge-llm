// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertFitlImmediateWinCase, withEveryZoneSupportMarker } from './shared-competence-helpers.js';

describe('VC shared.immediateWin witness', () => {
  it('selects a non-pass root that crosses the VC self-margin threshold', () => {
    assertFitlImmediateWinCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'vc-baseline',
      seatId: 'vc',
      playerIndex: 3,
      seed: 1,
      expectedRootStableMoveKey: 'event|{"eventCardId":"card-26","eventDeckId":"fitl-events-initial-card-pack","side":"shaded"}|false|event',
      selfMarginAssertion: {
        label: 'VC self margin',
        query: { kind: 'terminalVictoryMargin', seat: 'vc' },
        before: -1,
        after: 4,
        delta: { exact: 5 },
      },
      prepareState: (def, state) => {
        const opposition = withEveryZoneSupportMarker(def, state, 'passiveOpposition');
        return {
          ...opposition,
          markers: {
            ...opposition.markers,
            'saigon:none': {
              ...opposition.markers['saigon:none'],
              supportOpposition: 'neutral',
            },
            'hue:none': {
              ...opposition.markers['hue:none'],
              supportOpposition: 'neutral',
            },
          },
        };
      },
    });
  });
});
