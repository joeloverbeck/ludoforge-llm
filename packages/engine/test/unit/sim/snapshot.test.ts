import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  computeFullHash,
  createGameDefRuntime,
  initialState,
  type GameState,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import { extractDecisionPointSnapshot } from '../../../src/sim/snapshot.js';
import type { GameDef, Token } from '../../../src/kernel/types.js';
import type { StandardDecisionPointSnapshot, VerboseDecisionPointSnapshot } from '../../../src/sim/snapshot-types.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const STUB_SEAT_GROUP = {
  coinSeats: ['A'],
  insurgentSeats: ['B'],
  soloSeat: 'B',
  seatProp: 'faction',
} as const;

const STUB_MARKER_CONFIG = {
  activeState: 'active',
  passiveState: 'passive',
} as const;

const BOARD_A = asZoneId('board-a:none');
const BOARD_B = asZoneId('board-b:none');
const RESERVE = asZoneId('reserve:none');

const makeDef = (options?: {
  readonly withMargins?: boolean;
  readonly withVictoryStandings?: boolean;
  readonly includeUnknownMarginSeat?: boolean;
}): ValidatedGameDef => {
  const withMargins = options?.withMargins ?? true;
  const withVictoryStandings = options?.withVictoryStandings ?? true;
  const includeUnknownMarginSeat = options?.includeUnknownMarginSeat ?? false;

  const def: GameDef = asTaggedGameDef({
    metadata: { id: 'snapshot-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    seats: [{ id: 'A' }, { id: 'B' }],
    globalVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'swing', type: 'int', init: 0, min: -99, max: 99 },
    ],
    perPlayerVars: [
      { name: 'influence', type: 'int', init: 0, min: 0, max: 99 },
    ],
    zoneVars: [
      { name: 'pressure', type: 'int', init: 0, min: 0, max: 99 },
    ],
    zones: [
      { id: BOARD_A, zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: BOARD_B, zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: RESERVE, zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
    ],
    tokenTypes: [
      { id: 'piece', seat: 'A', props: { faction: 'string' } },
    ],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    actions: [],
    triggers: [],
    terminal: {
      conditions: [],
      ...(withMargins
        ? {
            margins: [
              {
                seat: 'A',
                value: {
                  op: '+',
                  left: { ref: 'gvar', var: 'score' },
                  right: { ref: 'gvar', var: 'swing' },
                },
              },
              {
                seat: 'B',
                value: {
                  op: '-',
                  left: { ref: 'gvar', var: 'score' },
                  right: 2,
                },
              },
              ...(includeUnknownMarginSeat
                ? [{
                    seat: 'ghost',
                    value: {
                      op: '+',
                      left: { ref: 'gvar', var: 'score' },
                      right: 1,
                    },
                  }]
                : []),
            ],
          }
        : {}),
    },
    ...(withVictoryStandings
      ? {
          victoryStandings: {
            seatGroupConfig: STUB_SEAT_GROUP,
            markerConfigs: { support: STUB_MARKER_CONFIG },
            markerName: 'support',
            defaultMarkerState: 'neutral',
            entries: [
              {
                seat: 'A',
                threshold: 0,
                formula: { type: 'controlledPopulationPlusGlobalVar', controlFn: 'coin', varName: 'score' },
              },
              {
                seat: 'B',
                threshold: 0,
                formula: { type: 'controlledPopulationPlusGlobalVar', controlFn: 'coin', varName: 'score' },
              },
            ],
            tieBreakOrder: ['A', 'B'],
          },
        }
      : {}),
  });

  return assertValidatedGameDef(def);
};

const token = (id: string, faction: string): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: { faction },
});

const makeState = (def: ValidatedGameDef): { readonly runtime: ReturnType<typeof createGameDefRuntime>; readonly state: GameState } => {
  const runtime = createGameDefRuntime(def);
  const base = initialState(def, 17, 2, undefined, runtime).state;
  const seeded: GameState = {
    ...base,
    globalVars: { score: 7, swing: 3 },
    perPlayerVars: {
      0: { influence: 4 },
      1: { influence: 9 },
    },
    zoneVars: {
      [BOARD_A]: { pressure: 2 },
      [BOARD_B]: { pressure: 5 },
      [RESERVE]: { pressure: 99 },
    },
    zones: {
      [BOARD_A]: [token('tok-a-1', 'A'), token('tok-a-2', 'A'), token('tok-a-3', 'B')],
      [BOARD_B]: [token('tok-b-1', 'B'), token('tok-b-2', 'A')],
      [RESERVE]: [token('tok-r-1', 'A'), token('tok-r-2', 'B')],
    },
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(1),
    turnCount: 4,
  };
  const fullHash = computeFullHash(runtime.zobristTable, seeded);

  return {
    runtime,
    state: {
      ...seeded,
      stateHash: fullHash,
      _runningHash: fullHash,
    },
  };
};

describe('extractDecisionPointSnapshot', () => {
  it('returns a minimal snapshot for none depth without throwing', () => {
    const def = makeDef();
    const { runtime, state } = makeState(def);

    const snapshot = extractDecisionPointSnapshot(def, state, runtime, 'none');

    assert.equal(snapshot.turnCount, 4);
    assert.equal(snapshot.phaseId, asPhaseId('main'));
    assert.equal(snapshot.activePlayer, asPlayerId(1));
    assert.deepEqual(snapshot.seatStandings, [
      { seat: 'A', margin: 10 },
      { seat: 'B', margin: 5 },
    ]);
    assert.ok(!('globalVars' in snapshot));
  });

  it('includes seat vars, board-only token counts, and global vars at standard depth', () => {
    const def = makeDef();
    const { runtime, state } = makeState(def);

    const snapshot = extractDecisionPointSnapshot(def, state, runtime, 'standard') as StandardDecisionPointSnapshot;

    assert.deepEqual(snapshot.globalVars, { score: 7, swing: 3 });
    assert.deepEqual(snapshot.seatStandings, [
      { seat: 'A', margin: 10, perPlayerVars: { influence: 4 }, tokenCountOnBoard: 3 },
      { seat: 'B', margin: 5, perPlayerVars: { influence: 9 }, tokenCountOnBoard: 2 },
    ]);
  });

  it('includes board-only zone summaries at verbose depth', () => {
    const def = makeDef();
    const { runtime, state } = makeState(def);

    const snapshot = extractDecisionPointSnapshot(def, state, runtime, 'verbose') as VerboseDecisionPointSnapshot;

    assert.deepEqual(snapshot.zoneSummaries, [
      {
        zoneId: BOARD_A,
        zoneVars: { pressure: 2 },
        tokenCountBySeat: { A: 2, B: 1 },
      },
      {
        zoneId: BOARD_B,
        zoneVars: { pressure: 5 },
        tokenCountBySeat: { A: 1, B: 1 },
      },
    ]);
  });

  it('returns empty seat standings when terminal margins are absent', () => {
    const def = makeDef({ withMargins: false });
    const { runtime, state } = makeState(def);

    const snapshot = extractDecisionPointSnapshot(def, state, runtime, 'minimal');

    assert.deepEqual(snapshot.seatStandings, []);
  });

  it('omits token counts when victory standings are absent', () => {
    const def = makeDef({ withVictoryStandings: false });
    const { runtime, state } = makeState(def);

    const snapshot = extractDecisionPointSnapshot(def, state, runtime, 'verbose') as VerboseDecisionPointSnapshot;

    assert.deepEqual(snapshot.seatStandings, [
      { seat: 'A', margin: 10, perPlayerVars: { influence: 4 } },
      { seat: 'B', margin: 5, perPlayerVars: { influence: 9 } },
    ]);
    assert.deepEqual(snapshot.zoneSummaries, [
      { zoneId: BOARD_A, zoneVars: { pressure: 2 } },
      { zoneId: BOARD_B, zoneVars: { pressure: 5 } },
    ]);
  });

  it('keeps unknown margin seats instead of crashing', () => {
    const def = makeDef({ includeUnknownMarginSeat: true });
    const { runtime, state } = makeState(def);

    const snapshot = extractDecisionPointSnapshot(def, state, runtime, 'standard') as StandardDecisionPointSnapshot;

    assert.deepEqual(snapshot.seatStandings, [
      { seat: 'A', margin: 10, perPlayerVars: { influence: 4 }, tokenCountOnBoard: 3 },
      { seat: 'B', margin: 5, perPlayerVars: { influence: 9 }, tokenCountOnBoard: 2 },
      { seat: 'ghost', margin: 8, perPlayerVars: {}, tokenCountOnBoard: 0 },
    ]);
  });

  it('does not mutate state and returns detached snapshot records', () => {
    const def = makeDef();
    const { runtime, state } = makeState(def);
    const beforeBranches = structuredClone({
      globalVars: state.globalVars,
      perPlayerVars: state.perPlayerVars,
      zoneVars: state.zoneVars,
      zones: state.zones,
      currentPhase: state.currentPhase,
      activePlayer: state.activePlayer,
      turnCount: state.turnCount,
    });
    const beforeHash = computeFullHash(runtime.zobristTable, state);

    const snapshot = extractDecisionPointSnapshot(def, state, runtime, 'verbose') as VerboseDecisionPointSnapshot;

    assert.equal(computeFullHash(runtime.zobristTable, state), beforeHash);
    assert.deepEqual({
      globalVars: state.globalVars,
      perPlayerVars: state.perPlayerVars,
      zoneVars: state.zoneVars,
      zones: state.zones,
      currentPhase: state.currentPhase,
      activePlayer: state.activePlayer,
      turnCount: state.turnCount,
    }, beforeBranches);
    assert.notEqual(snapshot.globalVars, state.globalVars);
    assert.notEqual(snapshot.seatStandings[0]?.perPlayerVars, state.perPlayerVars[0]);
    assert.notEqual(snapshot.zoneSummaries[0]?.zoneVars, state.zoneVars[BOARD_A]);
  });
});
