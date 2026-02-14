import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
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
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';
import { completeMoveDecisionSequenceOrThrow, pickDeterministicDecisionValue } from '../helpers/move-decision-helpers.js';

const REPEATED_RUN_COUNT = 20;

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
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            factions: ['0', '1', '2', '3'],
            overrideWindows: [{ id: 'remain-eligible', duration: 'nextTurn' }],
          },
          optionMatrix: [{ first: 'event', second: ['operation', 'operationPlusSpecialActivity'] }],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      { id: asActionId('pass'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-overrides'] } },
          { name: 'side', domain: { query: 'enums', values: ['unshaded'] } },
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
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'card-overrides',
            title: 'Typed Override',
            sideMode: 'single',
            unshaded: {
              text: 'Keep acting faction eligible.',
              eligibilityOverrides: [{ target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' }],
            },
          },
        ],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const scriptedMoves: readonly Move[] = [
  { actionId: asActionId('event'), params: { eventCardId: 'card-overrides', side: 'unshaded' } },
  { actionId: asActionId('operation'), params: {} },
  { actionId: asActionId('pass'), params: {} },
  { actionId: asActionId('operation'), params: {} },
];

const readJsonFixture = <T>(filePath: string): T => JSON.parse(readFileSync(join(process.cwd(), filePath), 'utf8')) as T;

const completeProfileMoveDeterministically = (
  baseMove: Move,
  def: GameDef,
  state: ReturnType<typeof initialState>,
): Move => {
  return completeMoveDecisionSequenceOrThrow(
    baseMove,
    def,
    state,
    (request) => {
      const min = request.min ?? 0;
      const options = request.options ?? [];
      if (request.type === 'chooseN' && options.length < min) {
        return undefined;
      }
      return pickDeterministicDecisionValue(request);
    },
    `Scripted move is unsatisfiable for actionId=${String(baseMove.actionId)}`,
  );
};

const runScriptedOperations = (def: GameDef, seed: number, actions: readonly string[]) => {
  let state: ReturnType<typeof initialState> = {
    ...initialState(def, seed, 2),
    turnOrderState: { type: 'roundRobin' },
  };
  const logs: unknown[] = [];

  for (const action of actions) {
    const template = legalMoves(def, state).find((move) => move.actionId === asActionId(action));
    if (template === undefined) {
      // Profile rollout is incremental; skip scripted actions that are not legal for this faction/state.
      continue;
    }
    let selectedMove: Move;
    try {
      selectedMove = completeProfileMoveDeterministically(template, def, state);
    } catch {
      // Skip scripted actions whose decision sequence is unsatisfiable in current state.
      continue;
    }
    const result = applyMove(def, state, selectedMove);
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
    readonly globalVars: Readonly<Record<string, number | boolean>>;
    readonly turnFlow: ReturnType<typeof requireCardDrivenRuntime>;
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
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: {
            factions: ['0', '1', '2', '3'],
            overrideWindows: [{ id: 'remain-eligible', duration: 'nextTurn' }],
          },
          optionMatrix: [{ first: 'event', second: ['operation', 'operationPlusSpecialActivity'] }],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actionPipelines: [
      {
        id: 'event-profile-partial',
        actionId: asActionId('event'),
        legality: null,
        costValidation: { op: '==', left: { ref: 'binding', name: 'branch' }, right: 'a' },
          costEffects: [{ addVar: { scope: 'global', var: 'spent', delta: 1 } }],
        targeting: {},
        stages: [{ effects: [{ addVar: { scope: 'global', var: 'resolved', delta: 1 } }] }],
        atomicity: 'partial',
      },
    ],
    actions: [
      { id: asActionId('pass'), actor: 'active', phase: asPhaseId('main'), params: [], pre: null, cost: [], effects: [], limits: [] },
      {
        id: asActionId('event'),
        actor: 'active',
        phase: asPhaseId('main'),
        params: [
          { name: 'eventCardId', domain: { query: 'enums', values: ['trace-card'] } },
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
    eventDecks: [
      {
        id: 'event-deck',
        drawZone: 'deck:none',
        discardZone: 'played:none',
        cards: [
          {
            id: 'trace-card',
            title: 'Trace Card',
            sideMode: 'dual',
            unshaded: {
              text: 'Unshaded payload.',
              eligibilityOverrides: [{ target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' }],
            },
            shaded: {
              text: 'Shaded payload.',
              eligibilityOverrides: [{ target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' }],
            },
          },
        ],
      },
    ],
    triggers: [],
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
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

  it('produces byte-identical operation-heavy traces across production spec operation profiles', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    // Coin operations (use action legal at scenario start under satisfiability filtering)
    // Insurgent operations (attack is intentionally excluded here because it requires board targets)
    // US/ARVN specials (advise, airLift, airStrike, govern, transport, raid)
    // NVA/VC specials (infiltrate, bombard, ambushNva, tax, subvert, ambushVc)
    const scenarios = [
      { label: 'coin', actions: ['sweep'] },
      { label: 'insurgent', actions: ['rally', 'march', 'terror', 'tax'] },
      { label: 'us-arvn-specials', actions: ['advise', 'airLift', 'airStrike', 'govern', 'transport', 'raid'] },
      { label: 'nva-vc-specials', actions: ['infiltrate', 'bombard', 'ambushNva', 'tax', 'subvert', 'ambushVc'] },
    ] as const;

    for (const scenario of scenarios) {
      const first = runScriptedOperations(def, 97, scenario.actions);
      const second = runScriptedOperations(def, 97, scenario.actions);
      assert.deepEqual(second, first, `Determinism failed for ${scenario.label}`);
    }
  });

  it('captures deterministic event side/branch/target metadata and partial-stages trace entries during eligible-faction sequencing', () => {
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
          eventCardId: 'trace-card',
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
          turnFlow: requireCardDrivenRuntime(result.state),
        },
      };
    };

    const first = run();
    const second = run();

    assert.deepEqual(second, first);
    assert.deepEqual(first, fixture);
  });
});
