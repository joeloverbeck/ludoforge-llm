import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  buildRuntimeTableIndex,
  compileFirstDecisionDomain,
  compilePipelineFirstDecisionDomain,
  createGameDefRuntime,
  createEvalContext,
  createEvalRuntimeResources,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const makeDef = (actionEffects: readonly ReturnType<typeof eff>[], pipelineStages?: ActionPipelineDef['stages']): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'first-decision-compiler-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), zoneKind: 'board', owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('reserve:none'), zoneKind: 'aux', owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [{ id: 'piece', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [{
      id: asActionId('act'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: actionEffects,
      limits: [],
    } satisfies ActionDef],
    actionPipelines: pipelineStages === undefined ? [] : [{
      id: 'profile-1',
      actionId: asActionId('act'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: pipelineStages,
      atomicity: 'partial',
    } satisfies ActionPipelineDef],
    triggers: [],
    terminal: { conditions: [] },
  });

const makeState = (zoneContents?: Partial<GameState['zones']>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
    'reserve:none': [],
    ...zoneContents,
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeContext = (def: GameDef, state: GameState) =>
  createEvalContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: {},
    runtimeTableIndex: buildRuntimeTableIndex(def),
    resources: createEvalRuntimeResources(),
  });

describe('first-decision compiler', () => {
  it('compiles direct enum first decisions via evalQuery cardinality', () => {
    const def = makeDef([
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$target',
          bind: '$target',
          options: { query: 'enums', values: ['a', 'b'] },
        },
      }),
    ]);

    const compiled = compileFirstDecisionDomain(def.actions[0]!.effects);
    assert.equal(compiled.compilable, true);
    assert.equal(compiled.check?.(makeContext(def, makeState())).admissible, true);
  });

  it('compiles direct token queries and rejects empty domains', () => {
    const def = makeDef([
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$target',
          bind: '$target',
          options: { query: 'tokensInZone', zone: 'board:none' },
        },
      }),
    ]);

    const compiled = compileFirstDecisionDomain(def.actions[0]!.effects);
    assert.equal(compiled.compilable, true);
    assert.equal(compiled.check?.(makeContext(def, makeState())).admissible, false);
    assert.equal(
      compiled.check?.(makeContext(def, makeState({
        'board:none': [{ id: asTokenId('piece-1'), type: 'piece', props: {} }],
      }))).admissible,
      true,
    );
  });

  it('marks guarded first decisions as non-compilable', () => {
    const def = makeDef([
      eff({
        if: {
          when: true,
          then: [eff({
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: ['a'] },
            },
          })],
        },
      }),
    ]);

    const compiled = compileFirstDecisionDomain(def.actions[0]!.effects);
    assert.equal(compiled.compilable, false);
    assert.equal(compiled.description, 'guardedFirstDecision');
  });

  it('marks forEach-scoped first decisions as non-compilable', () => {
    const def = makeDef([
      eff({
        forEach: {
          bind: '$zone',
          over: { query: 'zones' },
          effects: [eff({
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'tokensInZone', zone: 'board:none' },
            },
          })],
        },
      }),
    ]);

    const compiled = compileFirstDecisionDomain(def.actions[0]!.effects);
    assert.equal(compiled.compilable, false);
    assert.equal(compiled.description, 'loopScopedFirstDecision');
  });

  it('compiles pipeline profiles only when the earliest decision stage is unconditional', () => {
    const def = makeDef(
      [],
      [
        { stage: 'setup', effects: [eff({ bindValue: { bind: '$noop', value: 1 } })] },
        {
          stage: 'decide',
          effects: [eff({
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'zones' },
            },
          })],
        },
      ],
    );

    const compiled = compilePipelineFirstDecisionDomain(def.actionPipelines![0]!);
    assert.equal(compiled.compilable, true);
    assert.equal(compiled.check?.(makeContext(def, makeState())).admissible, true);
  });

  it('marks pipeline profiles non-compilable when an earlier stage has an unsupported first decision', () => {
    const def = makeDef(
      [],
      [
        {
          stage: 'guarded',
          effects: [eff({
            if: {
              when: true,
              then: [eff({
                chooseOne: {
                  internalDecisionId: 'decision:$target',
                  bind: '$target',
                  options: { query: 'enums', values: ['a'] },
                },
              })],
            },
          })],
        },
        {
          stage: 'later',
          effects: [eff({
            chooseOne: {
              internalDecisionId: 'decision:$later',
              bind: '$later',
              options: { query: 'enums', values: ['b'] },
            },
          })],
        },
      ],
    );

    const compiled = compilePipelineFirstDecisionDomain(def.actionPipelines![0]!);
    assert.equal(compiled.compilable, false);
    assert.match(compiled.description ?? '', /unsupportedStageFirstDecision/);
  });

  it('precomputes first-decision domains on GameDefRuntime for actions and pipelines', () => {
    const def = makeDef(
      [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$target',
            bind: '$target',
            options: { query: 'enums', values: ['a'] },
          },
        }),
      ],
      [
        {
          stage: 'decide',
          effects: [eff({
            chooseOne: {
              internalDecisionId: 'decision:$space',
              bind: '$space',
              options: { query: 'zones' },
            },
          })],
        },
      ],
    );

    const runtime = createGameDefRuntime(def);

    assert.equal(runtime.firstDecisionDomains.byActionId.get(asActionId('act'))?.compilable, true);
    assert.equal(runtime.firstDecisionDomains.byPipelineProfileId.get('profile-1')?.compilable, true);
  });
});
