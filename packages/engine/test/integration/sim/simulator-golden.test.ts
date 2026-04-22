// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  asActionId,
  asPhaseId,
  serializeTrace,
  type SerializedGameTrace,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { readFixtureJson } from '../../helpers/fixture-reader.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { firstLegalAgent } from '../../helpers/test-agents.js';

const createGoldenDef = (): ValidatedGameDef =>
  assertValidatedGameDef({
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
executor: 'actor' as const,
phase: [asPhaseId('p1')],
        params: [],
        pre: null,
        cost: [],
        effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        limits: [{ id: 'step1::turn::0', scope: 'turn', max: 1 }],
      },
      {
        id: asActionId('step2'),
actor: 'active',
executor: 'actor' as const,
phase: [asPhaseId('p2')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [{ id: 'step2::turn::0', scope: 'turn', max: 1 }],
      },
    ],
    triggers: [],
    terminal: { conditions: [{ when: { op: '>=', left: { _t: 2 as const, ref: 'gvar', var: 'score' }, right: 3 }, result: { type: 'draw' } }] },
  } as const);

describe('simulator golden trace stability', () => {
  it('fixed setup yields expected hash sequence and exact serialized golden trace', () => {
    const fixture = readFixtureJson<SerializedGameTrace>('trace/simulator-golden-trace.json');
    const def = createGoldenDef();

    const trace = runGame(def, 13, [firstLegalAgent, firstLegalAgent], 10);
    const serialized = serializeTrace(trace);

    assert.deepEqual(
      serialized.decisions.map((move) => move.stateHash),
      fixture.decisions.map((move) => move.stateHash),
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
