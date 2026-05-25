// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asSeatId,
  asTurnId,
  computeFullHash,
  createZobristTable,
  digestDecisionStackFrame,
  recomputeDecisionStackFrameDigest,
  type DecisionKey,
  type DecisionStackFrame,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const ROOT_PARENT_DIGEST = 'root';

const zobristSource = readFileSync(new URL('../../src/kernel/zobrist.js', import.meta.url), 'utf8');
assert.match(zobristSource, /decision-stack-frame-v2:a/);
assert.match(zobristSource, /decision-stack-frame-v2:b/);
assert.doesNotMatch(zobristSource, /decision-stack-frame-v1/);

const createGameDef = (): GameDef =>
  ({
    metadata: { id: 'zobrist-canonical-key-byte-identity', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'round', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
    zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }] },
  }) as unknown as GameDef;

const createBaseState = (): GameState => ({
  globalVars: { round: 1 },
  perPlayerVars: {
    '0': { score: 0 },
    '1': { score: 0 },
  },
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  decisionStack: [],
  nextFrameId: asDecisionFrameId(0),
  nextTurnId: asTurnId(0),
  activeDeciderSeatId: asSeatId('0'),
});

const createFrame = (index: number): DecisionStackFrame => ({
  frameId: asDecisionFrameId(index),
  parentFrameId: index === 0 ? null : asDecisionFrameId(index - 1),
  turnId: asTurnId(10 + index),
  context: {
    kind: 'chooseOne',
    seatId: asSeatId(String(index % 2)),
    decisionKey: `$choice-${index}` as DecisionKey,
    options: [
      { value: `option-${index}-a`, legality: 'legal', illegalReason: null, resolution: 'exact' },
      { value: `option-${index}-b`, legality: 'legal', illegalReason: null, resolution: 'exact' },
    ],
  },
  ...(index % 2 === 0 ? { continuationBindings: { ['$carried' as DecisionKey]: `value-${index}` } } : {}),
  effectFrame: {
    programCounter: index,
    boundedIterationCursors: { loop: index % 3 },
    localBindings: { selected: `local-${index}` },
    pendingTriggerQueue: [],
    ...(index % 2 === 0
      ? {
        decisionHistory: [{
          seatId: asSeatId(String(index % 2)),
          decisionContextKind: 'chooseOne',
          decisionKey: `$choice-${index}` as DecisionKey,
          decision: {
            kind: 'chooseOne',
            decisionKey: `$choice-${index}` as DecisionKey,
            value: `option-${index}-a`,
          },
          frameId: asDecisionFrameId(index),
        }],
      }
      : {}),
  },
});

describe('Spec 194 Zobrist canonical key byte identity', () => {
  it('computes byte-identical full hashes for repeated v2 decision-stack states', () => {
    const table = createZobristTable(createGameDef());
    for (let count = 1; count <= 12; count += 1) {
      const frames = Array.from({ length: count }, (_, index) => createFrame(index));
      const state: GameState = {
        ...createBaseState(),
        decisionStack: frames,
        nextFrameId: asDecisionFrameId(count),
        nextTurnId: asTurnId(10 + count),
      };

      assert.equal(computeFullHash(table, state), computeFullHash(table, structuredClone(state)));
    }
  });

  it('produces identical frame digests through recompute, cold-cache, and warm-cache paths', () => {
    const table = createZobristTable(createGameDef());
    for (let index = 0; index < 12; index += 1) {
      const parentDigest = index === 0 ? ROOT_PARENT_DIGEST : recomputeDecisionStackFrameDigest(createFrame(index - 1));
      const frame = createFrame(index);
      const expected = recomputeDecisionStackFrameDigest(frame, parentDigest);
      const cold = digestDecisionStackFrame(structuredClone(frame), table, parentDigest);
      const warm = digestDecisionStackFrame(structuredClone(frame), table, parentDigest);

      assert.equal(cold, expected, `frame ${index}: cold cache digest differed`);
      assert.equal(warm, expected, `frame ${index}: warm cache digest differed`);
    }
  });
});
