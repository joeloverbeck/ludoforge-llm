import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  applyMove,
  asActionId,
  initialState,
  terminalResult,
  type GameDef,
} from '../../src/kernel/index.js';

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

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
    const start = initialState(def, 101, 2);
    const applied = applyMove(def, start, { actionId: asActionId('boostSupport'), params: {} });
    const terminal = terminalResult(def, applied.state);

    assert.equal(markdown.includes('data/fitl/'), false);
    assert.deepEqual(
      def.zones.map((zone) => String(zone.id)),
      ['hue:none', 'quang-tri:none'],
    );
    assert.equal(def.coupPlan?.phases[0]?.id, 'victory');
    assert.equal(def.victory?.checkpoints[0]?.id, 'us-threshold');
    assert.deepEqual(terminal, {
      type: 'win',
      player: 0,
      victory: {
        timing: 'duringCoup',
        checkpointId: 'us-threshold',
        winnerFaction: 'us',
      },
    });
  });

  it('computes final-coup winner from fixture-defined margins and deterministic ranking metadata', () => {
    const { def } = compileFixture();
    const start = initialState(def, 202, 2);
    const applied = applyMove(def, start, { actionId: asActionId('markFinalCoup'), params: {} });
    const terminal = terminalResult(def, applied.state);

    assert.deepEqual(terminal, {
      type: 'win',
      player: 1,
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-coup',
        winnerFaction: 'nva',
        ranking: [
          { faction: 'nva', margin: 4, rank: 1, tieBreakKey: 'nva' },
          { faction: 'us', margin: 2, rank: 2, tieBreakKey: 'us' },
        ],
      },
    });
  });
});
