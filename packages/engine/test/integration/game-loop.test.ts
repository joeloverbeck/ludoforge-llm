import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asTriggerId,
  createRng,
  initialState,
  legalMoves,
  nextInt,
  terminalResult,
  type GameDef,
  type GameState,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';

const createProgressionDef = (): GameDef =>
  ({
    metadata: { id: 'game-loop-progression-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 10 },
      { name: 'triggerHits', type: 'int', init: 0, min: 0, max: 10 },
    ],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('claim'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
        limits: [{ scope: 'turn', max: 1 }],
      },
    ],
    triggers: [
      {
        id: asTriggerId('onClaim'),
        event: { type: 'actionResolved', action: asActionId('claim') },
        effects: [{ addVar: { scope: 'global', var: 'triggerHits', delta: 1 } }],
      },
    ],
    terminal: { conditions: [{ when: { op: '>=', left: { ref: 'gvar', var: 'score' }, right: 3 }, result: { type: 'draw' } }] },
  }) as unknown as GameDef;

const createDeterminismDef = (): GameDef =>
  ({
    metadata: { id: 'game-loop-determinism-int', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 50 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('plusOne'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
        limits: [],
      },
      {
        id: asActionId('plusTwo'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 2 } }],
        limits: [],
      },
    ],
    triggers: [
      {
        id: asTriggerId('onAnyAction'),
        event: { type: 'actionResolved' },
        effects: [],
      },
    ],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const serializeLogs = (entries: readonly TriggerLogEntry[]): readonly string[] =>
  entries.map((entry) => JSON.stringify(entry));

const replayWithPolicy = (seed: number, steps: number): { readonly hashes: readonly bigint[]; readonly logs: readonly string[][] } => {
  const def = createDeterminismDef();
  let state: GameState = initialState(def, seed, 2).state;
  let policyRng = createRng(BigInt(seed));
  const hashes: bigint[] = [state.stateHash];
  const logs: string[][] = [];

  for (let step = 0; step < steps; step += 1) {
    const moves = legalMoves(def, state);
    assert.ok(moves.length > 0);
    const [moveIndex, nextPolicyRng] = nextInt(policyRng, 0, moves.length - 1);
    const selectedMove = moves[moveIndex];
    assert.ok(selectedMove !== undefined);

    const result = applyMove(def, state, selectedMove);
    hashes.push(result.state.stateHash);
    logs.push([...serializeLogs(result.triggerFirings)]);

    state = result.state;
    policyRng = nextPolicyRng;
  }

  return { hashes, logs };
};

describe('game loop integration', () => {
  it('progresses across turns and stops auto-advancing once terminal', () => {
    const def = createProgressionDef();
    let state = initialState(def, 21, 2).state;

    const first = applyMove(def, state, legalMoves(def, state)[0]!);
    assert.equal(first.state.globalVars.score, 1);
    assert.equal(first.state.globalVars.triggerHits, 1);
    assert.equal(first.state.turnCount, 1);
    assert.equal(terminalResult(def, first.state), null);
    assert.equal(first.triggerFirings.length, 1);

    const second = applyMove(def, first.state, legalMoves(def, first.state)[0]!);
    assert.equal(second.state.globalVars.score, 2);
    assert.equal(second.state.globalVars.triggerHits, 2);
    assert.equal(second.state.turnCount, 2);
    assert.equal(terminalResult(def, second.state), null);
    assert.equal(second.triggerFirings.length, 1);

    const third = applyMove(def, second.state, legalMoves(def, second.state)[0]!);
    assert.equal(third.state.globalVars.score, 3);
    assert.equal(third.state.globalVars.triggerHits, 3);
    assert.deepEqual(terminalResult(def, third.state), { type: 'draw' });
    assert.equal(third.state.turnCount, 2);
    assert.equal(third.triggerFirings.length, 1);
  });

  it('is deterministic for identical seed and PRNG-indexed move policy', () => {
    const first = replayWithPolicy(42, 12);
    const second = replayWithPolicy(42, 12);

    assert.deepEqual(first.hashes, second.hashes);
    assert.deepEqual(first.logs, second.logs);
  });
});
