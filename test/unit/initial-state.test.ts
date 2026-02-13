import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readCompilerFixture } from '../helpers/production-spec-helpers.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  computeFullHash,
  createZobristTable,
  initialState,
  serializeGameState,
  type GameDef,
  type SerializedGameState,
} from '../../src/kernel/index.js';

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

    assertNoErrors(parsed);
    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);

    const serialized = serializeGameState(initialState(compiled.gameDef!, 17, 2));
    const fixture = readJsonFixture<SerializedGameState>('test/fixtures/trace/fitl-foundation-initial-state.golden.json');

    assert.deepEqual(serialized, fixture);
    assert.equal(JSON.stringify(serialized), JSON.stringify(fixture));
  });

  it('reveals played and lookahead slots from the inferred draw pile when turnFlow lifecycle is declared', () => {
    const def: GameDef = {
      metadata: { id: 'lifecycle-start', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [
        { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
        { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      ],
      tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
      setup: [
        { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
        { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } },
        { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      ],
      turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: { factions: [], overrideWindows: [] },
        optionMatrix: [],
        passRewards: [],
        durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
      },
      actions: [
        {
          id: asActionId('pass'),
          actor: 'active',
          phase: asPhaseId('main'),
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;

    const state = initialState(def, 1, 2);
    assert.equal(state.zones['played:none']?.length, 1);
    assert.equal(state.zones['lookahead:none']?.length, 1);
    assert.equal(state.zones['deck:none']?.length, 1);
    assert.equal(state.zones['played:none']?.[0]?.id, 'tok_card_2');
    assert.equal(state.zones['lookahead:none']?.[0]?.id, 'tok_card_1');
  });

  it('initializes turnFlow eligibility runtime state from declared faction order', () => {
    const def: GameDef = {
      metadata: { id: 'turn-flow-eligibility-start', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
      constants: {},
      globalVars: [{ name: 'res0', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: { factions: ['1', '0'], overrideWindows: [] },
        optionMatrix: [],
        passRewards: [],
        durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
      },
      actions: [],
      triggers: [],
      endConditions: [],
    } as unknown as GameDef;

    const state = initialState(def, 1, 2);
    assert.equal(state.activePlayer, asPlayerId(1));
    assert.deepEqual(state.turnFlow?.factionOrder, ['1', '0']);
    assert.deepEqual(state.turnFlow?.eligibility, { '1': true, '0': true });
    assert.equal(state.turnFlow?.currentCard.firstEligible, '1');
    assert.equal(state.turnFlow?.currentCard.secondEligible, '0');
  });
});
