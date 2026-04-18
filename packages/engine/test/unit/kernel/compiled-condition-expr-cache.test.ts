// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  getCompiledCondition,
  type ConditionAST,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { makeEvalContext } from '../../helpers/eval-context-test-helpers.js';

type NonBooleanCondition = Exclude<ConditionAST, boolean>;

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'compiled-condition-expr-cache-test', players: { min: 1, max: 1 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: { resources: 4 },
  perPlayerVars: { 0: { resources: 2 } },
  zoneVars: {},
  playerCount: 1,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeCtx = (bindings: Readonly<Record<string, unknown>> = {}) => {
  const def = makeDef();
  return makeEvalContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: makeState(),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings,
  });
};

describe('compiled condition expr cache', () => {
  it('returns a compiled predicate for a compilable condition', () => {
    const condition: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'binding', name: '$choice' },
      right: 'a',
    };

    const compiled = getCompiledCondition(condition);

    assert.ok(compiled !== null);
    assert.equal(compiled(makeCtx({ '$choice': 'a' })), true);
    assert.equal(compiled(makeCtx({ '$choice': 'b' })), false);
  });

  it('returns null for a non-compilable condition', () => {
    const condition: ConditionAST = { op: 'adjacent', left: 'board:none', right: 'board:none' };

    assert.equal(getCompiledCondition(condition), null);
  });

  it('reuses the cached predicate for the same condition reference', () => {
    const condition: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'gvar', var: 'resources' },
      right: 3,
    };

    const first = getCompiledCondition(condition);
    const second = getCompiledCondition(condition);

    assert.ok(first !== null);
    assert.equal(first, second);
  });

  it('caches null results without re-attempting compilation', () => {
    let opReads = 0;
    const condition = new Proxy(
      {
        left: 'board:none',
        right: 'board:none',
      },
      {
        get(target, prop, receiver) {
          if (prop === 'op') {
            opReads += 1;
            return 'adjacent';
          }
          return Reflect.get(target, prop, receiver);
        },
      },
    ) as unknown as NonBooleanCondition;

    assert.equal(getCompiledCondition(condition), null);
    assert.equal(opReads, 1);
    assert.equal(getCompiledCondition(condition), null);
    assert.equal(opReads, 1);
  });
});
