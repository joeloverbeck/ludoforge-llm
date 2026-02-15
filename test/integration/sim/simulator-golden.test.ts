import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, serializeTrace, type Agent, type GameDef, type SerializedGameTrace } from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';

const firstLegalAgent: Agent = {
  chooseMove(input) {
    const move = input.legalMoves[0];
    if (move === undefined) {
      throw new Error('firstLegalAgent requires at least one legal move');
    }
    return { move, rng: input.rng };
  },
};

const readJsonFixture = <T>(filePath: string): T => JSON.parse(readFileSync(join(process.cwd(), filePath), 'utf8')) as T;

const createGoldenDef = (): GameDef =>
  ({
    metadata: { id: 'sim-golden-trace', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('p1') }, { id: asPhaseId('p2') }] },
    actions: [
      {
        id: asActionId('step1'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('p1'),
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
        limits: [{ scope: 'turn', max: 1 }],
      },
      {
        id: asActionId('step2'),
actor: 'active',
executor: 'actor',
phase: asPhaseId('p2'),
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [{ scope: 'turn', max: 1 }],
      },
    ],
    triggers: [],
    terminal: { conditions: [{ when: { op: '>=', left: { ref: 'gvar', var: 'score' }, right: 3 }, result: { type: 'draw' } }] },
  }) as unknown as GameDef;

describe('simulator golden trace stability', () => {
  it('fixed setup yields expected hash sequence and exact serialized golden trace', () => {
    const fixture = readJsonFixture<SerializedGameTrace>('test/fixtures/trace/simulator-golden-trace.json');
    const def = createGoldenDef();

    const trace = runGame(def, 13, [firstLegalAgent, firstLegalAgent], 10);
    const serialized = serializeTrace(trace);

    assert.deepEqual(
      serialized.moves.map((move) => move.stateHash),
      fixture.moves.map((move) => move.stateHash),
    );
    assert.deepEqual(serialized, fixture);
  });

  it('same setup run twice remains byte-identical after serializeTrace', () => {
    const def = createGoldenDef();

    const first = JSON.stringify(serializeTrace(runGame(def, 13, [firstLegalAgent, firstLegalAgent], 10)));
    const second = JSON.stringify(serializeTrace(runGame(def, 13, [firstLegalAgent, firstLegalAgent], 10)));

    assert.equal(first, second);
  });
});
