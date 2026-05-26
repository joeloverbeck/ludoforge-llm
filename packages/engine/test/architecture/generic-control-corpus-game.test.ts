// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } from '../../src/cnl/index.js';
import { initialState } from '../../src/kernel/index.js';
import { assertValidatedGameDef } from '../../src/kernel/validate-gamedef.js';
import {
  GENERIC_CONTROL_TERMINAL_FIXTURE,
  playGenericControlTerminalFixture,
} from './fixtures/generic-control-terminal-fixture.js';

const ENTRYPOINT = join(process.cwd(), '..', '..', 'data', 'games', 'generic-control.game-spec.md');

const compileGenericControl = () => {
  const bundle = loadGameSpecBundleFromEntrypoint(ENTRYPOINT);
  const staged = runGameSpecStagesFromBundle(bundle);

  assert.equal(staged.validation.blocked, false);
  assert.equal(staged.compilation.blocked, false);
  assert.deepEqual(staged.validation.diagnostics, []);
  assert.ok(staged.compilation.result, 'generic-control must produce a compile result');
  assert.deepEqual(staged.compilation.result.diagnostics, []);
  assert.ok(staged.compilation.result.gameDef, 'generic-control must compile to a GameDef');
  assertValidatedGameDef(staged.compilation.result.gameDef);

  return staged.compilation.result.gameDef;
};

test('generic-control compiles deterministically', () => {
  const first = JSON.stringify(compileGenericControl());
  const second = JSON.stringify(compileGenericControl());

  assert.equal(second, first);
});

test('generic-control seeded first-legal play reaches terminal score result', () => {
  const gameDef = compileGenericControl();
  const initial = initialState(
    gameDef,
    GENERIC_CONTROL_TERMINAL_FIXTURE.seed,
    GENERIC_CONTROL_TERMINAL_FIXTURE.playerCount,
  ).state;
  const { result } = playGenericControlTerminalFixture(gameDef, initial);

  assert.ok(result, 'generic-control must reach terminal within bounded play');
  assert.equal(result.type, 'score');
  assert.deepEqual(
    result.ranking.map((entry) => entry.score),
    GENERIC_CONTROL_TERMINAL_FIXTURE.expectedScores,
  );
});
