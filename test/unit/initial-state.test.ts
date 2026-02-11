import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import {
  asPhaseId,
  asPlayerId,
  computeFullHash,
  createZobristTable,
  initialState,
  serializeGameState,
  type GameDef,
  type SerializedGameState,
} from '../../src/kernel/index.js';

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

const readJsonFixture = <T>(filePath: string): T => JSON.parse(readFileSync(join(process.cwd(), filePath), 'utf8')) as T;

const createDef = (): GameDef =>
  ({
    metadata: { id: 'initial-state-test', players: { min: 2, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'coins', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [{ name: 'score', type: 'int', init: 1, min: 0, max: 99 }],
    zones: [
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'hand:none', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [
      { setVar: { scope: 'global', var: 'coins', value: 5 } },
      { createToken: { type: 'card', zone: 'deck:none' } },
    ],
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    actions: [],
    triggers: [
      {
        id: 'onTurnStart',
        event: { type: 'turnStart' },
        effects: [{ addVar: { scope: 'global', var: 'coins', delta: 1 } }],
      },
      {
        id: 'onMainEnter',
        event: { type: 'phaseEnter', phase: asPhaseId('main') },
        effects: [{ addVar: { scope: 'global', var: 'coins', delta: { ref: 'gvar', var: 'coins' } } }],
      },
    ],
    endConditions: [],
  }) as unknown as GameDef;

describe('initialState', () => {
  it('initializes vars, zones, and player metadata', () => {
    const state = initialState(createDef(), 11, 3);

    assert.equal(state.playerCount, 3);
    assert.equal(state.activePlayer, asPlayerId(0));
    assert.equal(state.currentPhase, asPhaseId('main'));
    assert.equal(state.turnCount, 0);
    assert.deepEqual(state.actionUsage, {});
    assert.equal(state.perPlayerVars['0']?.score, 1);
    assert.equal(state.perPlayerVars['1']?.score, 1);
    assert.equal(state.perPlayerVars['2']?.score, 1);
    assert.equal(state.zones['hand:none']?.length, 0);
    assert.equal(state.zones['deck:none']?.length, 1);
    assert.equal(state.nextTokenOrdinal, 1);
  });

  it('defaults omitted playerCount to metadata.players.min', () => {
    const state = initialState(createDef(), 11);
    assert.equal(state.playerCount, 2);
  });

  it('throws descriptive errors for invalid playerCount', () => {
    assert.throws(() => initialState(createDef(), 11, 1), /out of range/);
    assert.throws(() => initialState(createDef(), 11, 5), /out of range/);
    assert.throws(() => initialState(createDef(), 11, 1.5), /safe integer/);
  });

  it('applies setup effects and startup triggers before final hash capture', () => {
    const def = createDef();
    const state = initialState(def, 7, 2);

    assert.equal(state.globalVars.coins, 12);
    assert.equal(state.zones['deck:none']?.length, 1);

    const table = createZobristTable(def);
    assert.equal(state.stateHash, computeFullHash(table, state));
  });

  it('dispatches startup trigger order as turnStart then phaseEnter', () => {
    const state = initialState(createDef(), 3, 2);
    assert.equal(state.globalVars.coins, 12);
  });

  it('is deterministic for same seed and GameDef', () => {
    const def = createDef();
    const first = initialState(def, 42, 2);
    const second = initialState(def, 42, 2);

    assert.deepEqual(first, second);
  });

  it('throws when turnStructure.phases is empty', () => {
    const def = createDef();
    const noPhaseDef: GameDef = {
      ...def,
      turnStructure: { ...def.turnStructure, phases: [] },
    };

    assert.throws(() => initialState(noPhaseDef, 1, 2), /at least one phase/);
  });

  it('matches FITL foundation initial-state golden snapshot from embedded dataAssets', () => {
    const markdown = readCompilerFixture('fitl-foundation-inline-assets.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);

    const serialized = serializeGameState(initialState(compiled.gameDef!, 17, 2));
    const fixture = readJsonFixture<SerializedGameState>('test/fixtures/trace/fitl-foundation-initial-state.golden.json');

    assert.deepEqual(serialized, fixture);
    assert.equal(JSON.stringify(serialized), JSON.stringify(fixture));
  });
});
