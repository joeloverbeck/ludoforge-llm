import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTriggerId,
  asZoneId,
  createCollector,
  createEvalRuntimeResources,
  dispatchTriggers,
  legalMoves,
  terminalResult,
  type ActionDef,
  type ConditionAST,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

type NonBooleanCondition = Exclude<ConditionAST, boolean>;

const makeConditionProxy = (
  op: NonBooleanCondition['op'],
  fields: Record<string, unknown>,
): { condition: NonBooleanCondition; getReads: () => number } => {
  let opReads = 0;
  const condition = new Proxy(fields, {
    get(target, prop, receiver) {
      if (prop === 'op') {
        opReads += 1;
        return op;
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as NonBooleanCondition;

  return { condition, getReads: () => opReads };
};

const makeAction = (pre: ConditionAST | null): ActionDef => ({
  id: asActionId('operate'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre,
  cost: [],
  effects: [],
  limits: [],
});

const makeLegalDef = (actionPre: ConditionAST | null): GameDef =>
  ({
    metadata: { id: 'compiled-application-sites-legal', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('city:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [makeAction(actionPre)],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeTriggerDef = (trigger: GameDef['triggers'][number]): GameDef =>
  ({
    metadata: { id: 'compiled-application-sites-trigger', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [trigger],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeTerminalDef = (when: ConditionAST): GameDef =>
  ({
    metadata: { id: 'compiled-application-sites-terminal', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [{ when, result: { type: 'draw' } }] },
  }) as unknown as GameDef;

const makeState = (overrides: Partial<GameState> = {}): GameState => ({
  globalVars: { score: 0 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
    'city:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

describe('compiled condition application sites', () => {
  it('uses the compiled path for compilable action preconditions', () => {
    const { condition, getReads } = makeConditionProxy('==', { left: 1, right: 1 });
    const def = makeLegalDef(condition);
    const state = makeState();

    assert.equal(legalMoves(def, state).length, 1);
    assert.equal(legalMoves(def, state).length, 1);
    assert.equal(getReads(), 2);
  });

  it('falls back to the interpreter for non-compilable action preconditions', () => {
    const { condition, getReads } = makeConditionProxy('adjacent', {
      left: 'board:none',
      right: 'city:none',
    });
    const def = makeLegalDef(condition);
    const state = makeState();

    assert.equal(legalMoves(def, state).length, 0);
    assert.equal(legalMoves(def, state).length, 0);
    assert.equal(getReads(), 3);
  });

  it('uses compiled trigger match conditions and still emits trace entries', () => {
    const { condition, getReads } = makeConditionProxy('==', { left: 1, right: 1 });
    const def = makeTriggerDef({
      id: asTriggerId('onTurnStart'),
      event: { type: 'turnStart' },
      match: condition,
      effects: [],
    });
    const state = makeState({ zones: {} });
    const collector = createCollector({ conditionTrace: true });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      dispatchTriggers({
        def,
        state,
        rng: { state: state.rng },
        event: { type: 'turnStart' },
        depth: 0,
        maxDepth: 8,
        triggerLog: [],
        evalRuntimeResources: createEvalRuntimeResources({ collector }),
      });
    }

    assert.equal(getReads(), 2);
    assert.equal(collector.conditionTrace?.length, 2);
    assert.equal(collector.conditionTrace?.[0]?.context, 'triggerMatch');
    assert.equal(collector.conditionTrace?.[0]?.result, true);
  });

  it('uses compiled trigger when conditions and still emits trace entries', () => {
    const { condition, getReads } = makeConditionProxy('==', { left: 1, right: 1 });
    const def = makeTriggerDef({
      id: asTriggerId('onTurnStart'),
      event: { type: 'turnStart' },
      when: condition,
      effects: [],
    });
    const state = makeState({ zones: {} });
    const collector = createCollector({ conditionTrace: true });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      dispatchTriggers({
        def,
        state,
        rng: { state: state.rng },
        event: { type: 'turnStart' },
        depth: 0,
        maxDepth: 8,
        triggerLog: [],
        evalRuntimeResources: createEvalRuntimeResources({ collector }),
      });
    }

    assert.equal(getReads(), 2);
    assert.equal(collector.conditionTrace?.length, 2);
    assert.equal(collector.conditionTrace?.[0]?.context, 'triggerWhen');
    assert.equal(collector.conditionTrace?.[0]?.result, true);
  });

  it('uses the compiled path for terminal conditions', () => {
    const { condition, getReads } = makeConditionProxy('==', { left: 1, right: 1 });
    const def = makeTerminalDef(condition);
    const state = makeState({ zones: {} });

    assert.deepEqual(terminalResult(def, state), { type: 'draw' });
    assert.deepEqual(terminalResult(def, state), { type: 'draw' });
    assert.equal(getReads(), 2);
  });

  it('routes the owned callsites through the cached helper', () => {
    const legalMovesSource = readKernelSource('src/kernel/legal-moves.ts');
    const legalChoicesSource = readKernelSource('src/kernel/legal-choices.ts');
    const applyMoveSource = readKernelSource('src/kernel/apply-move.ts');
    const freeOperationSource = readKernelSource('src/kernel/free-operation-viability.ts');
    const triggerSource = readKernelSource('src/kernel/trigger-dispatch.ts');
    const terminalSource = readKernelSource('src/kernel/terminal.ts');

    assert.match(legalMovesSource, /evaluateConditionWithCache\(currentPhaseDef\.actionDefaults\.pre, ctx\)/);
    assert.match(legalMovesSource, /evaluateConditionWithCache\(action\.pre, ctx\)/);
    assert.match(legalChoicesSource, /evaluateConditionWithCache\(currentPhaseDef\.actionDefaults\.pre, evalCtx\)/);
    assert.match(legalChoicesSource, /evaluateConditionWithCache\(action\.pre, evalCtx\)/);
    assert.match(applyMoveSource, /evaluateConditionWithCache\(action\.pre, preflight\.evalCtx\)/);
    assert.match(applyMoveSource, /evaluateConditionWithCache\(preflight\.action\.pre, preflight\.evalCtx\)/);
    assert.match(freeOperationSource, /evaluateConditionWithCache\(action\.pre, preflight\.evalCtx\)/);
    assert.match(triggerSource, /evaluateConditionWithCache\(trigger\.match, evalCtx\)/);
    assert.match(triggerSource, /evaluateConditionWithCache\(trigger\.when, evalCtx\)/);
    assert.match(terminalSource, /evaluateConditionWithCache\(checkpoint\.when, baseCtx\)/);
    assert.match(terminalSource, /evaluateConditionWithCache\(endCondition\.when, baseCtx\)/);
  });
});
