import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import {
  applyMove,
  asActionId,
  asPhaseId,
  initialState,
  serializeGameState,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';

const selfOverride = 'eligibilityOverride:self:eligible:remain-eligible';
const noOverride = 'none';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-card-flow-determinism-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'ops', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [],
    zones: [
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'played:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'lookahead:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'leader:none', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
    setup: [
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
    ],
    turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
    turnFlow: {
      cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
      eligibility: {
        factions: ['0', '1', '2', '3'],
        overrideWindows: [{ id: 'remain-eligible', duration: 'nextCard' }],
      },
      optionMatrix: [{ first: 'event', second: ['operation', 'operationPlusSpecialActivity'] }],
      passRewards: [],
      durationWindows: ['card', 'nextCard', 'coup', 'campaign'],
    },
    actions: [
      { id: asActionId('pass'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [{ name: 'selfOverride', domain: { query: 'enums', values: [noOverride, selfOverride] } }],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'ops', delta: 1 } }],
        limits: [],
      },
      {
        id: asActionId('operationPlusSpecialActivity'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'ops', delta: 1 } }],
        limits: [],
      },
    ],
    triggers: [],
    endConditions: [],
  }) as unknown as GameDef;

const scriptedMoves: readonly Move[] = [
  { actionId: asActionId('event'), params: { selfOverride } },
  { actionId: asActionId('operation'), params: {} },
  { actionId: asActionId('pass'), params: {} },
  { actionId: asActionId('operation'), params: {} },
];

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

const compileFixtureDef = (name: string): GameDef => {
  const parsed = parseGameSpec(readCompilerFixture(name));
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
  assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
  assert.deepEqual(compiled.diagnostics, []);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const runScriptedOperations = (def: GameDef, seed: number, actions: readonly string[]) => {
  let state = initialState(def, seed, 2);
  const logs: unknown[] = [];

  for (const action of actions) {
    const result = applyMove(def, state, { actionId: asActionId(action), params: {} });
    logs.push(result.triggerFirings);
    state = result.state;
  }

  return {
    serializedState: serializeGameState(state),
    logs,
  };
};

describe('FITL card-flow determinism integration', () => {
  it('produces byte-identical state and trace logs for same seed and move sequence', () => {
    const def = createDef();
    const run = () => {
      let state = initialState(def, 97, 4);
      const logs: unknown[] = [];

      for (const move of scriptedMoves) {
        const result = applyMove(def, state, move);
        logs.push(result.triggerFirings);
        state = result.state;
      }

      return {
        serializedState: serializeGameState(state),
        logs,
      };
    };

    const first = run();
    const second = run();

    assert.deepEqual(second, first);
  });

  it('produces byte-identical operation-heavy traces across FITL operation/special-activity fixtures', () => {
    const scenarios = [
      {
        fixture: 'fitl-operations-coin.md',
        actions: ['train', 'patrol', 'sweep', 'assault'],
      },
      {
        fixture: 'fitl-operations-insurgent.md',
        actions: ['rally', 'march', 'attack', 'terror'],
      },
      {
        fixture: 'fitl-special-us-arvn.md',
        actions: ['advise', 'airLift', 'airStrike', 'govern', 'transport', 'raid'],
      },
      {
        fixture: 'fitl-special-nva-vc.md',
        actions: ['infiltrate', 'bombard', 'ambushNva', 'tax', 'subvert', 'ambushVc'],
      },
    ] as const;

    for (const scenario of scenarios) {
      const def = compileFixtureDef(scenario.fixture);
      const first = runScriptedOperations(def, 97, scenario.actions);
      const second = runScriptedOperations(def, 97, scenario.actions);
      assert.deepEqual(second, first);
    }
  });
});
