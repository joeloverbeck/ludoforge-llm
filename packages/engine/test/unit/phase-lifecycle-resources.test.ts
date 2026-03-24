import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  asTriggerId,
  asZoneId,
  createCollector,
  createEvalRuntimeResources,
  type EvalRuntimeResources,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { dispatchLifecycleEvent } from '../../src/kernel/phase-lifecycle.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [{ id: asTokenId('t1'), type: 'card', props: {} }],
  },
  nextTokenOrdinal: 1,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'phase-lifecycle-resources', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    tokenTypes: [{ id: 'card', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [],
    triggers: [
      {
        id: asTriggerId('turnStartProbe'),
        event: { type: 'turnStart' },
        when: {
          op: '>=',
          left: {
            aggregate: {
              op: 'count',
              query: {
                query: 'tokenZones',
                source: { query: 'tokensInZone', zone: 'deck:none' },
              },
            },
          },
          right: 1,
        },
        effects: [],
      },
      {
        id: asTriggerId('phaseEnterProbe'),
        event: { type: 'phaseEnter', phase: asPhaseId('main') },
        when: {
          op: '>=',
          left: {
            aggregate: {
              op: 'count',
              query: {
                query: 'tokenZones',
                source: { query: 'tokensInZone', zone: 'deck:none' },
              },
            },
          },
          right: 1,
        },
        effects: [],
      },
    ],
    terminal: { conditions: [] },
  });

describe('dispatchLifecycleEvent runtime resources', () => {
  it('preserves state identity when lifecycle dispatch produces no state/rng changes', () => {
    const def = makeDef();
    const state = makeState();
    const resources = createEvalRuntimeResources({ collector: createCollector({ trace: true }) });

    const afterTurnStart = dispatchLifecycleEvent(def, state, { type: 'turnStart' }, undefined, undefined, resources);
    // Spec 78: createMutableState always shallow-clones, so reference identity
    // is no longer guaranteed for no-op lifecycle dispatches.
    assert.deepStrictEqual(afterTurnStart, state);

    const afterPhaseEnter = dispatchLifecycleEvent(def, afterTurnStart, { type: 'phaseEnter', phase: asPhaseId('main') }, undefined, undefined, resources);
    assert.deepStrictEqual(afterPhaseEnter, state);
  });

  it('reuses provided runtime resources across successive lifecycle calls in one operation', () => {
    const def = makeDef();
    const state = makeState();
    const resources = createEvalRuntimeResources({
      collector: createCollector({ trace: true }),
    });

    const afterTurnStart = dispatchLifecycleEvent(def, state, { type: 'turnStart' }, undefined, undefined, resources);
    const afterPhaseEnter = dispatchLifecycleEvent(def, afterTurnStart, { type: 'phaseEnter', phase: asPhaseId('main') }, undefined, undefined, resources);

    assert.deepStrictEqual(afterPhaseEnter, state);
  });

  it('fails fast with RUNTIME_CONTRACT_INVALID when evalRuntimeResources is malformed', () => {
    const def = makeDef();
    const state = makeState();
    const malformedResources = { collector: 'not-an-object' };

    assert.throws(
      () =>
        dispatchLifecycleEvent(
          def,
          state,
          { type: 'turnStart' },
          undefined,
          undefined,
          malformedResources as unknown as EvalRuntimeResources,
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown };
        assert.equal(details.code, 'RUNTIME_CONTRACT_INVALID');
        assert.match(String(details.message), /dispatchLifecycleEvent evalRuntimeResources/i);
        return true;
      },
    );
  });
});
