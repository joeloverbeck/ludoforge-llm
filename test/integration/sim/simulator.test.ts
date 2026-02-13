import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../../src/cnl/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../../helpers/diagnostic-helpers.js';
import { asActionId, asPhaseId, nextInt, serializeTrace, type Agent, type GameDef } from '../../../src/kernel/index.js';
import { runGames } from '../../../src/sim/index.js';

const rngDrivenAgent: Agent = {
  chooseMove(input) {
    const [index, nextRng] = nextInt(input.rng, 0, input.legalMoves.length - 1);
    const move = input.legalMoves[index];
    if (move === undefined) {
      throw new Error('rngDrivenAgent requires at least one legal move');
    }
    return { move, rng: nextRng };
  },
};

const createDef = (): GameDef =>
  ({
    metadata: { id: 'sim-rungames-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('smallStep'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
        limits: [],
      },
      {
        id: asActionId('bigStep'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 2 } }],
        limits: [],
      },
    ],
    triggers: [],
    endConditions: [{ when: { op: '>=', left: { ref: 'gvar', var: 'score' }, right: 6 }, result: { type: 'draw' } }],
  }) as unknown as GameDef;

describe('runGames integration', () => {
  it('keeps a non-FITL fixture compile + simulation path green', () => {
    const markdown = readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', 'compile-valid.md'), 'utf8');
    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.deepEqual(validatorDiagnostics, []);
    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);

    const [trace] = runGames(compiled.gameDef!, [41], [rngDrivenAgent, rngDrivenAgent], 3);
    assert.notEqual(trace, undefined);
    assert.equal(trace?.gameDefId, 'compiler-valid');
    assert.equal(trace?.stopReason, 'terminal');
  });

  it('preserves input seed order in returned traces', () => {
    const def = createDef();
    const seeds = [31, 7, 19];

    const traces = runGames(def, seeds, [rngDrivenAgent, rngDrivenAgent], 8);
    assert.deepEqual(
      traces.map((trace) => trace.seed),
      seeds,
    );
  });

  it('same setup run twice yields byte-identical serialized traces', () => {
    const def = createDef();
    const seeds = [5, 12, 27];

    const first = runGames(def, seeds, [rngDrivenAgent, rngDrivenAgent], 10).map((trace) => JSON.stringify(serializeTrace(trace)));
    const second = runGames(def, seeds, [rngDrivenAgent, rngDrivenAgent], 10).map((trace) => JSON.stringify(serializeTrace(trace)));

    assert.deepEqual(first, second);
  });

  it('returns an empty list for empty seeds', () => {
    const def = createDef();

    const traces = runGames(def, [], [rngDrivenAgent, rngDrivenAgent], 3);
    assert.deepEqual(traces, []);
  });

  it('produces run-independent traces for distinct seeds', () => {
    const def = createDef();

    const forward = runGames(def, [11, 29], [rngDrivenAgent, rngDrivenAgent], 10).map((trace) => JSON.stringify(serializeTrace(trace)));
    const reverse = runGames(def, [29, 11], [rngDrivenAgent, rngDrivenAgent], 10).map((trace) => JSON.stringify(serializeTrace(trace)));

    assert.equal(forward[0], reverse[1]);
    assert.equal(forward[1], reverse[0]);
    assert.notEqual(forward[0], forward[1]);
  });
});
