import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  applyMove,
  asActionId,
  asPhaseId,
  initialState,
  legalMoves,
  serializeGameState,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import { createEligibilityOverrideDirective, FITL_NO_OVERRIDE } from './fitl-events-test-helpers.js';

const selfOverride = createEligibilityOverrideDirective({
  target: 'self',
  eligibility: 'eligible',
  windowId: 'remain-eligible',
});
const REPEATED_RUN_COUNT = 20;
const noOverride = FITL_NO_OVERRIDE;

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

const readJsonFixture = <T>(filePath: string): T => JSON.parse(readFileSync(join(process.cwd(), filePath), 'utf8')) as T;

const compileFixtureDef = (name: string): GameDef => {
  const parsed = parseGameSpec(readCompilerFixture(name));
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled);
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

interface FitlEventInitialPackGolden {
  readonly seed: number;
  readonly initialLegalMoves: readonly Move[];
  readonly selectedMove: Move;
  readonly triggerFirings: readonly unknown[];
  readonly postState: {
    readonly globalVars: Readonly<Record<string, number>>;
    readonly turnFlow: ReturnType<typeof initialState>['turnFlow'];
  };
}

const createEventTraceDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-events-initial-pack-golden-int', players: { min: 4, max: 4 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [
      { name: 'spent', type: 'int', init: 0, min: 0, max: 99 },
      { name: 'resolved', type: 'int', init: 0, min: 0, max: 99 },
    ],
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
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } },
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
    operationProfiles: [
      {
        id: 'event-profile-partial',
        actionId: asActionId('event'),
        legality: {},
        cost: {
          validate: { op: '==', left: { ref: 'binding', name: 'branch' }, right: 'a' },
          spend: [{ addVar: { scope: 'global', var: 'spent', delta: 1 } }],
        },
        targeting: {},
        resolution: [{ effects: [{ addVar: { scope: 'global', var: 'resolved', delta: 1 } }] }],
        partialExecution: { mode: 'allow' },
      },
    ],
    actions: [
      { id: asActionId('pass'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [
          { name: 'selfOverride', domain: { query: 'enums', values: [noOverride, selfOverride] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded', 'shaded'] } },
          { name: 'branch', domain: { query: 'enums', values: ['a', 'b'] } },
          { name: 'targetPrimary', domain: { query: 'enums', values: ['space-a', 'space-b'] } },
          { name: 'targetSecondary', domain: { query: 'enums', values: ['space-c', 'space-d'] } },
        ],
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
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operationPlusSpecialActivity'),
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
    endConditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
  }) as unknown as GameDef;

describe('FITL card-flow determinism integration', () => {
  it('produces byte-identical state and trace logs for same seed and move sequence across repeated runs', () => {
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

    const baseline = run();
    for (let runIndex = 0; runIndex < REPEATED_RUN_COUNT; runIndex += 1) {
      assert.deepEqual(run(), baseline);
    }
  });

  it('produces byte-identical operation-heavy traces across FITL operation/special-activity fixtures', () => {
    const scenarios = [
      {
        fixture: 'fitl-operations-coin.md',
        // train/patrol require complex params (chooseN/chooseOne decisions) — excluded from determinism stub test.
        actions: ['sweep', 'assault'],
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

  it('captures deterministic event side/branch/target metadata and partial-resolution trace entries during eligible-faction sequencing', () => {
    // Fixture policy: this golden trace is intentionally reviewed state/trace contract data, not an auto-regenerated snapshot.
    const fixture = readJsonFixture<FitlEventInitialPackGolden>('test/fixtures/trace/fitl-events-initial-pack.golden.json');
    const def = createEventTraceDef();
    const seed = 113;

    const run = (): FitlEventInitialPackGolden => {
      const start = initialState(def, seed, 4);
      const initialLegalMoves = legalMoves(def, start);

      // Event action has an operation profile → legalMoves emits a template move.
      // Construct the fully-parameterized move directly; validateMove uses legalChoices() for profiled actions.
      const eventMove: Move = {
        actionId: asActionId('event'),
        params: {
          selfOverride,
          side: 'shaded',
          branch: 'b',
          targetPrimary: 'space-b',
          targetSecondary: 'space-d',
        },
      };

      const result = applyMove(def, start, eventMove);
      assert.equal(result.state.globalVars.spent, 0);
      assert.equal(result.state.globalVars.resolved, 1);

      return {
        seed,
        initialLegalMoves,
        selectedMove: eventMove,
        triggerFirings: result.triggerFirings,
        postState: {
          globalVars: result.state.globalVars,
          turnFlow: result.state.turnFlow,
        },
      };
    };

    const first = run();
    const second = run();

    assert.deepEqual(second, first);
    assert.deepEqual(first, fixture);
  });
});
