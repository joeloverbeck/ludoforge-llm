import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readCompilerFixture } from '../helpers/production-spec-helpers.js';
import {
  applyMove,
  asActionId,
  initialState,
  terminalResult,
  type GameDef,
} from '../../src/kernel/index.js';

const compileFixture = (): { readonly markdown: string; readonly def: GameDef } => {
  const markdown = readCompilerFixture('fitl-foundation-coup-victory-inline-assets.md');
  const parsed = parseGameSpec(markdown);
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

  assertNoErrors(parsed);
  assertNoDiagnostics(compiled);
  assert.notEqual(compiled.gameDef, null);

  return { markdown, def: compiled.gameDef! };
};

describe('FITL coup victory integration', () => {
  it('compiles from embedded YAML dataAssets and resolves during-coup threshold wins', () => {
    const { markdown, def } = compileFixture();
    const start = initialState(def, 101, 2).state;
    const applied = applyMove(def, start, { actionId: asActionId('boostSupport'), params: {} });
    const terminal = terminalResult(def, applied.state);

    assert.equal(markdown.includes('data/fitl/'), false);
    assert.deepEqual(
      def.zones.map((zone) => String(zone.id)),
      ['hue:none', 'quang-tri:none'],
    );
    assert.equal(def.turnOrder?.type, 'cardDriven');
    assert.equal(def.turnOrder?.type === 'cardDriven' ? def.turnOrder.config.coupPlan?.phases[0]?.id : undefined, 'victory');
    assert.equal(def.terminal.checkpoints?.[0]?.id, 'us-threshold');
    assert.deepEqual(terminal, {
      type: 'win',
      player: 1,
      victory: {
        timing: 'duringCoup',
        checkpointId: 'us-threshold',
        winnerSeat: 'nva',
        ranking: [
          { seat: 'nva', margin: 4, rank: 1, tieBreakKey: 'nva' },
          { seat: 'us', margin: 2, rank: 2, tieBreakKey: 'us' },
        ],
      },
    });
  });

  it('computes final-coup winner from fixture-defined margins and deterministic ranking metadata', () => {
    const { def } = compileFixture();
    const start = initialState(def, 202, 2).state;
    const applied = applyMove(def, start, { actionId: asActionId('markFinalCoup'), params: {} });
    const terminal = terminalResult(def, applied.state);

    assert.deepEqual(terminal, {
      type: 'win',
      player: 1,
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-coup',
        winnerSeat: 'nva',
        ranking: [
          { seat: 'nva', margin: 4, rank: 1, tieBreakKey: 'nva' },
          { seat: 'us', margin: 2, rank: 2, tieBreakKey: 'us' },
        ],
      },
    });
  });
});
