// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as assert from 'node:assert/strict';

import { assertFitlImmediateWinCase } from './shared-competence-helpers.js';
import type { GameDef, GameState, Token } from '../../src/kernel/index.js';

describe('NVA shared.immediateWin witness', () => {
  it('selects a non-pass root while the NVA self-margin is winning', () => {
    assertFitlImmediateWinCase({
      testFile: fileURLToPath(import.meta.url),
      profileId: 'nva-baseline',
      seatId: 'nva',
      playerIndex: 2,
      seed: 1,
      expectedRootStableMoveKey: 'terror|{}|false|operation',
      selfMarginAssertion: {
        label: 'NVA self margin',
        query: { kind: 'terminalVictoryMargin', seat: 'nva' },
        before: 4,
        after: 4,
        delta: { exact: 0 },
      },
      prepareState: prepareImmediateWinState,
    });
  });
});

function prepareImmediateWinState(def: GameDef, state: GameState): GameState {
  const controlTargets = def.zones
    .filter((zone) => zone.zoneKind === 'board')
    .sort((left, right) => Number(right.attributes?.population ?? 0) - Number(left.attributes?.population ?? 0))
    .slice(0, 8);
  const nvaTokens = Object.values(state.zones).flat().filter((token) => token.props.faction === 'NVA');
  assert.ok(nvaTokens.length >= controlTargets.length, 'expected enough NVA tokens for control fixture');

  const zones: Record<string, readonly Token[]> = Object.fromEntries(
    Object.keys(state.zones).map((zoneId) => [zoneId, []]),
  );
  for (const [index, zone] of controlTargets.entries()) {
    zones[zone.id] = [nvaTokens[index]!];
  }
  zones['available-NVA:none'] = nvaTokens.slice(controlTargets.length);

  return { ...state, zones };
}
