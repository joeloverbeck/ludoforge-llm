import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  createCollector,
  asZoneId,
  asPhaseId,
  asPlayerId,
  isEvalErrorCode,
  resolvePlayerSel,
  resolveSinglePlayerSel,
  resolveSingleZoneSel,
  resolveZoneSel,
  type EvalContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'selector-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:2'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('bench:1'), owner: 'player', visibility: 'public', ordering: 'queue' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (playerCount: number): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount,
  zones: {
    'deck:none': [],
    'hand:0': [],
    'hand:1': [],
    'hand:2': [],
    'bench:1': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(2),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EvalContext>): EvalContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(3),
  activePlayer: asPlayerId(2),
  actorPlayer: asPlayerId(1),
  bindings: { '$picked': asPlayerId(2) },
  collector: createCollector(),
  ...overrides,
});

describe('resolvePlayerSel', () => {
  it('resolves actor, active, all, allOther, id, chosen, and relative selectors', () => {
    const ctx = makeCtx();

    assert.deepEqual(resolvePlayerSel('actor', ctx), [asPlayerId(1)]);
    assert.deepEqual(resolvePlayerSel('active', ctx), [asPlayerId(2)]);
    assert.deepEqual(resolvePlayerSel('all', ctx), [asPlayerId(0), asPlayerId(1), asPlayerId(2)]);
    assert.deepEqual(resolvePlayerSel('allOther', ctx), [asPlayerId(0), asPlayerId(2)]);
    assert.deepEqual(resolvePlayerSel({ id: asPlayerId(0) }, ctx), [asPlayerId(0)]);
    assert.deepEqual(resolvePlayerSel({ chosen: '$picked' }, ctx), [asPlayerId(2)]);
    assert.deepEqual(resolvePlayerSel({ relative: 'left' }, ctx), [asPlayerId(0)]);
    assert.deepEqual(resolvePlayerSel({ relative: 'right' }, ctx), [asPlayerId(2)]);
  });

  it('throws typed errors for invalid id and non-player chosen binding', () => {
    const ctx = makeCtx();

    assert.throws(() => resolvePlayerSel({ id: asPlayerId(99) }, ctx), (error: unknown) =>
      isEvalErrorCode(error, 'MISSING_VAR'),
    );

    const badChosenCtx = makeCtx({ bindings: { '$picked': 'not-a-player' } });
    assert.throws(() => resolvePlayerSel({ chosen: '$picked' }, badChosenCtx), (error: unknown) =>
      isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('resolveSinglePlayerSel throws cardinality errors on 0 or >1 matches', () => {
    const zeroCtx = makeCtx({
      state: makeState(1),
      actorPlayer: asPlayerId(0),
      activePlayer: asPlayerId(0),
    });
    assert.throws(() => resolveSinglePlayerSel('allOther', zeroCtx), (error: unknown) =>
      isEvalErrorCode(error, 'SELECTOR_CARDINALITY'),
    );

    const manyCtx = makeCtx();
    assert.throws(() => resolveSinglePlayerSel('all', manyCtx), (error: unknown) =>
      isEvalErrorCode(error, 'SELECTOR_CARDINALITY'),
    );
  });
});

describe('resolveZoneSel', () => {
  it('resolves deck:none, hand:actor, hand:all, and chosen-owner selectors', () => {
    const ctx = makeCtx();

    assert.deepEqual(resolveZoneSel('deck:none', ctx), ['deck:none']);
    assert.deepEqual(resolveZoneSel('hand:actor', ctx), ['hand:1']);
    assert.deepEqual(resolveZoneSel('hand:all', ctx), ['hand:0', 'hand:1', 'hand:2']);
    assert.deepEqual(resolveZoneSel('hand:$picked', ctx), ['hand:2']);
  });

  it('throws descriptive typed errors for unknown zone base or missing variant', () => {
    const ctx = makeCtx();

    assert.throws(
      () => resolveZoneSel('graveyard:actor', ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'MISSING_VAR') &&
        typeof error.message === 'string' &&
        error.message.includes('availableZoneIds'),
    );

    assert.throws(
      () => resolveZoneSel('bench:0', ctx),
      (error: unknown) =>
        isEvalErrorCode(error, 'MISSING_VAR') &&
        typeof error.message === 'string' &&
        error.message.includes('candidates'),
    );
  });

  it('resolveSingleZoneSel throws cardinality errors on 0 or >1 matches', () => {
    const zeroCtx = makeCtx({
      state: makeState(1),
      actorPlayer: asPlayerId(0),
      activePlayer: asPlayerId(0),
    });
    assert.throws(() => resolveSingleZoneSel('hand:allOther', zeroCtx), (error: unknown) =>
      isEvalErrorCode(error, 'SELECTOR_CARDINALITY'),
    );

    const manyCtx = makeCtx();
    assert.throws(() => resolveSingleZoneSel('hand:all', manyCtx), (error: unknown) =>
      isEvalErrorCode(error, 'SELECTOR_CARDINALITY'),
    );
  });
});
