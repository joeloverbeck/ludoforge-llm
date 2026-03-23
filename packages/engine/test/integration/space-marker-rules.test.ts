import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createExecutionEffectContext,
  evalCondition,
  initialState,
  validateMapPayload,
  type ConditionAST,
  type GameDef,
  type MapPayload,
} from '../../src/kernel/index.js';
import { makeEvalContext } from '../helpers/eval-context-test-helpers.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'space-marker-rules', players: { min: 1, max: 1 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    {
      id: asZoneId('saigon:none'),
      zoneKind: 'board',
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
      category: 'city',
      attributes: { population: 2 },
      adjacentTo: [],
    },
    {
      id: asZoneId('central-laos:none'),
      zoneKind: 'board',
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
      category: 'province',
      attributes: { population: 0 },
      adjacentTo: [],
    },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
  markerLattices: [
    {
      id: 'supportOpposition',
      states: ['activeOpposition', 'passiveOpposition', 'neutral', 'passiveSupport', 'activeSupport'],
      defaultState: 'neutral',
      constraints: [
        {
          when: {
            op: '==',
            left: { _t: 2 as const, ref: 'zoneProp', zone: '$space', prop: 'population' },
            right: 0,
          },
          allowedStates: ['neutral'],
        },
      ],
    },
  ],
});

describe('space marker lattice rules', () => {
  it('evaluates markerStateAllowed against declarative lattice constraints', () => {
    const def = makeDef();
    const state = initialState(def, 11, 1).state;
    const ctx = makeEvalContext({
      def,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
    });

    const legalCondition: ConditionAST = {
      op: 'markerStateAllowed',
      space: 'saigon:none',
      marker: 'supportOpposition',
      state: 'activeSupport',
    };
    const illegalCondition: ConditionAST = {
      op: 'markerStateAllowed',
      space: 'central-laos:none',
      marker: 'supportOpposition',
      state: 'activeSupport',
    };

    assert.equal(evalCondition(legalCondition, ctx), true);
    assert.equal(evalCondition(illegalCondition, ctx), false);
  });

  it('evaluates markerShiftAllowed with the same transition semantics as shiftMarker', () => {
    const def = makeDef();
    const adjacencyGraph = buildAdjacencyGraph(def.zones);
    const base = initialState(def, 17, 1).state;
    const shiftableState = {
      ...base,
      markers: {
        ...base.markers,
        'saigon:none': { supportOpposition: 'activeSupport' },
        'central-laos:none': { supportOpposition: 'neutral' },
      },
    };
    const evalCtx = makeEvalContext({
      def,
      adjacencyGraph,
      state: shiftableState,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.equal(
      evalCondition({ op: 'markerShiftAllowed', space: 'saigon:none', marker: 'supportOpposition', delta: 1 }, evalCtx),
      false,
    );
    assert.equal(
      evalCondition({ op: 'markerShiftAllowed', space: 'saigon:none', marker: 'supportOpposition', delta: -1 }, evalCtx),
      true,
    );
    assert.equal(
      evalCondition({ op: 'markerShiftAllowed', space: 'central-laos:none', marker: 'supportOpposition', delta: 1 }, evalCtx),
      false,
    );

    const shiftCtx = createExecutionEffectContext({
      def,
      adjacencyGraph,
      state: shiftableState,
      rng: { state: shiftableState.rng },
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      resources: evalCtx.resources,
    });

    const result = applyEffects([{
      shiftMarker: {
        space: 'saigon:none',
        marker: 'supportOpposition',
        delta: -1,
      },
    }], shiftCtx);
    assert.equal(result.state.markers['saigon:none']?.supportOpposition, 'passiveSupport');
  });

  it('rejects illegal setMarker and shiftMarker transitions at runtime', () => {
    const def = makeDef();
    const adjacencyGraph = buildAdjacencyGraph(def.zones);
    const base = initialState(def, 13, 1).state;

    const setCtx = createExecutionEffectContext({
      def,
      adjacencyGraph,
      state: base,
      rng: { state: base.rng },
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      resources: makeEvalContext({
        def,
        adjacencyGraph,
        state: base,
        activePlayer: asPlayerId(0),
        actorPlayer: asPlayerId(0),
        bindings: {},
      }).resources,
    });

    assert.throws(
      () => applyEffects([{
        setMarker: {
          space: 'central-laos:none',
          marker: 'supportOpposition',
          state: 'activeSupport',
        },
      }], setCtx),
      /illegal for lattice "supportOpposition"/,
    );

    const shiftBase = {
      ...base,
      markers: {
        ...base.markers,
        'central-laos:none': { supportOpposition: 'neutral' },
      },
    };
    const shiftCtx = createExecutionEffectContext({
      ...setCtx,
      state: shiftBase,
      rng: { state: shiftBase.rng },
    });

    assert.throws(
      () => applyEffects([{
        shiftMarker: {
          space: 'central-laos:none',
          marker: 'supportOpposition',
          delta: 1,
        },
      }], shiftCtx),
      /illegal for lattice "supportOpposition"/,
    );
  });

  it('validates condition-based marker constraints against initial map markers', () => {
    const payload: MapPayload = {
      spaces: [
        {
          id: 'central-laos:none',
          category: 'province',
          attributes: { population: 0 },
          adjacentTo: [],
        },
      ],
      markerLattices: [
        {
          id: 'supportOpposition',
          states: ['neutral', 'activeSupport'],
          defaultState: 'neutral',
          constraints: [
            {
              when: {
                op: '==',
                left: { _t: 2 as const, ref: 'zoneProp', zone: '$space', prop: 'population' },
                right: 0,
              },
              allowedStates: ['neutral'],
            },
          ],
        },
      ],
      spaceMarkers: [
        {
          spaceId: 'central-laos:none',
          markerId: 'supportOpposition',
          state: 'activeSupport',
        },
      ],
    };

    const diagnostics = validateMapPayload(payload);
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'MAP_MARKER_CONSTRAINT_VIOLATION'));
  });
});
