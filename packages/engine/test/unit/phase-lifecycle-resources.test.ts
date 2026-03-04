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
  type GameDef,
  type GameState,
  type QueryRuntimeCache,
} from '../../src/kernel/index.js';
import { dispatchLifecycleEvent } from '../../src/kernel/phase-lifecycle.js';

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
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeDef = (): GameDef =>
  ({
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
  }) as unknown as GameDef;

describe('dispatchLifecycleEvent runtime resources', () => {
  it('preserves state identity when lifecycle dispatch produces no state/rng changes', () => {
    const def = makeDef();
    const state = makeState();
    const resources = createEvalRuntimeResources({ collector: createCollector({ trace: true }) });

    const afterTurnStart = dispatchLifecycleEvent(def, state, { type: 'turnStart' }, undefined, undefined, resources);
    assert.equal(afterTurnStart, state);

    const afterPhaseEnter = dispatchLifecycleEvent(def, afterTurnStart, { type: 'phaseEnter', phase: asPhaseId('main') }, undefined, undefined, resources);
    assert.equal(afterPhaseEnter, state);
  });

  it('reuses provided query cache across successive lifecycle calls in one operation', () => {
    const def = makeDef();
    const state = makeState();
    let getCalls = 0;
    let setCalls = 0;
    const indexesByState = new WeakMap<GameState, ReadonlyMap<string, string>>();
    const queryRuntimeCache: QueryRuntimeCache = {
      getIndex: (cacheState, key) => {
        getCalls += 1;
        if (key !== 'tokenZoneByTokenId') {
          return undefined;
        }
        return indexesByState.get(cacheState);
      },
      setIndex: (cacheState, key, value) => {
        if (key !== 'tokenZoneByTokenId') {
          return;
        }
        setCalls += 1;
        indexesByState.set(cacheState, value);
      },
    };
    const resources = createEvalRuntimeResources({
      collector: createCollector({ trace: true }),
      queryRuntimeCache,
    });

    const afterTurnStart = dispatchLifecycleEvent(def, state, { type: 'turnStart' }, undefined, undefined, resources);
    const afterPhaseEnter = dispatchLifecycleEvent(def, afterTurnStart, { type: 'phaseEnter', phase: asPhaseId('main') }, undefined, undefined, resources);

    assert.equal(afterPhaseEnter, state);
    assert.equal(setCalls, 1);
    assert.equal(getCalls, 2);
  });
});
