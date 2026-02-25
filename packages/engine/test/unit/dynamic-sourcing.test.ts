import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';

/**
 * Dynamic piece sourcing pattern (Rule 1.4.1):
 *
 *   sourcePiece(faction, pieceType, targetZone):
 *     if count(available:{faction}, {pieceType}) > 0:
 *       moveToken from available:{faction} to {targetZone}
 *     else if faction != 'US' || pieceType not in ['troops', 'base']:
 *       moveToken from map to {targetZone}    // take from any map space
 *     else:
 *       skip  // US Troops/Bases cannot be taken from map
 *
 * This is expressed entirely via nested if/then/else + aggregate count +
 * forEach (limit 1) + moveToken. No new EffectAST types required.
 *
 * Zone naming: zones use 'base:none' format (e.g., 'availableNVA:none')
 * since faction names are not player selectors.
 */

const token = (id: string, faction: string, pieceType: string): Token => ({
  id: asTokenId(id),
  type: pieceType,
  props: { faction },
});

const makeDef = (): GameDef => ({
  metadata: { id: 'dynamic-sourcing-test', players: { min: 1, max: 4 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('availableNVA:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('availableUS:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('saigon:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('hue:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('target:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (zones: Record<string, readonly Token[]>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 4,
  zones,
  nextTokenOrdinal: 100,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (zones: Record<string, readonly Token[]>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(zones),
  rng: createRng(42n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
});

/**
 * Build the sourcePiece pattern as a nested if/then/else EffectAST.
 *
 * Parameters:
 * - availableZone: zone to check for available pieces (e.g., 'availableNVA:none')
 * - mapZone: fallback zone to take from map
 * - targetZone: destination zone
 * - isUSRestricted: whether this is a US Troops/Bases placement (cannot take from map)
 */
const buildSourcePieceEffect = (
  availableZone: string,
  mapZone: string,
  targetZone: string,
  isUSRestricted: boolean,
): EffectAST => {
  const thenBranch: readonly EffectAST[] = [
    {
      forEach: {
        bind: '$tok',
        over: { query: 'tokensInZone', zone: availableZone },
        effects: [{ moveToken: { token: '$tok', from: availableZone, to: targetZone, position: 'bottom' } }],
        limit: 1,
      },
    },
  ];

  if (isUSRestricted) {
    return {
      if: {
        when: {
          op: '>',
          left: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: availableZone } } },
          right: 0,
        },
        then: thenBranch,
      },
    };
  }

  return {
    if: {
      when: {
        op: '>',
        left: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: availableZone } } },
        right: 0,
      },
      then: thenBranch,
      else: [
        {
          forEach: {
            bind: '$mapTok',
            over: { query: 'tokensInZone', zone: mapZone },
            effects: [{ moveToken: { token: '$mapTok', from: mapZone, to: targetZone, position: 'bottom' } }],
            limit: 1,
          },
        },
      ],
    },
  };
};

/**
 * Build a fully nested sourcePiece pattern with depth-2 if/then/else
 * that mirrors the actual rule: outer checks available, inner checks
 * US restriction.
 */
const buildNestedSourcePieceEffect = (
  availableZone: string,
  mapZone: string,
  targetZone: string,
  isUSRestricted: boolean,
): EffectAST => ({
  if: {
    when: {
      op: '>',
      left: { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: availableZone } } },
      right: 0,
    },
    then: [
      {
        forEach: {
          bind: '$tok',
          over: { query: 'tokensInZone', zone: availableZone },
          effects: [{ moveToken: { token: '$tok', from: availableZone, to: targetZone, position: 'bottom' } }],
          limit: 1,
        },
      },
    ],
    else: [
      {
        if: {
          when: isUSRestricted ? { op: '==', left: 1, right: 0 } : { op: '==', left: 1, right: 1 },
          then: [
            {
              forEach: {
                bind: '$mapTok',
                over: { query: 'tokensInZone', zone: mapZone },
                effects: [
                  { moveToken: { token: '$mapTok', from: mapZone, to: targetZone, position: 'bottom' } },
                ],
                limit: 1,
              },
            },
          ],
        },
      },
    ],
  },
});

describe('dynamic piece sourcing pattern', () => {
  it('places from available when available zone has pieces', () => {
    const nvaGuerrillas = [
      token('nva-g1', 'NVA', 'guerrilla'),
      token('nva-g2', 'NVA', 'guerrilla'),
      token('nva-g3', 'NVA', 'guerrilla'),
    ];
    const ctx = makeCtx({
      'availableNVA:none': nvaGuerrillas,
      'availableUS:none': [],
      'saigon:none': [],
      'hue:none': [],
      'target:none': [],
    });

    const effect = buildSourcePieceEffect('availableNVA:none', 'saigon:none', 'target:none', false);
    const result = applyEffect(effect, ctx);

    assert.equal(result.state.zones['target:none']?.length, 1, 'one piece placed in target');
    assert.equal(result.state.zones['target:none']?.[0]?.id, 'nva-g1', 'first available piece placed');
    assert.equal(result.state.zones['availableNVA:none']?.length, 2, 'available reduced by one');
  });

  it('takes from map when available zone is empty and faction is not US-restricted', () => {
    const mapPiece = token('nva-g-map', 'NVA', 'guerrilla');
    const ctx = makeCtx({
      'availableNVA:none': [],
      'availableUS:none': [],
      'saigon:none': [mapPiece],
      'hue:none': [],
      'target:none': [],
    });

    const effect = buildSourcePieceEffect('availableNVA:none', 'saigon:none', 'target:none', false);
    const result = applyEffect(effect, ctx);

    assert.equal(result.state.zones['target:none']?.length, 1, 'piece taken from map');
    assert.equal(result.state.zones['target:none']?.[0]?.id, 'nva-g-map', 'map piece placed in target');
    assert.equal(result.state.zones['saigon:none']?.length, 0, 'map zone depleted');
  });

  it('skips placement when available empty and US Troops are restricted from map', () => {
    const ctx = makeCtx({
      'availableNVA:none': [],
      'availableUS:none': [],
      'saigon:none': [token('us-troop-map', 'US', 'troops')],
      'hue:none': [],
      'target:none': [],
    });

    const effect = buildSourcePieceEffect('availableUS:none', 'saigon:none', 'target:none', true);
    const result = applyEffect(effect, ctx);

    assert.equal(result.state.zones['target:none']?.length, 0, 'no piece placed');
    assert.equal(result.state.zones['saigon:none']?.length, 1, 'map zone unchanged');
  });

  it('skips placement when available empty and US Bases are restricted from map', () => {
    const ctx = makeCtx({
      'availableNVA:none': [],
      'availableUS:none': [],
      'saigon:none': [token('us-base-map', 'US', 'base')],
      'hue:none': [],
      'target:none': [],
    });

    const effect = buildSourcePieceEffect('availableUS:none', 'saigon:none', 'target:none', true);
    const result = applyEffect(effect, ctx);

    assert.equal(result.state.zones['target:none']?.length, 0, 'no piece placed');
    assert.equal(result.state.zones['saigon:none']?.length, 1, 'map zone unchanged');
  });

  it('nested if/then/else depth 2 executes without errors (non-restricted faction)', () => {
    const mapPiece = token('nva-g-nested', 'NVA', 'guerrilla');
    const ctx = makeCtx({
      'availableNVA:none': [],
      'availableUS:none': [],
      'saigon:none': [mapPiece],
      'hue:none': [],
      'target:none': [],
    });

    const effect = buildNestedSourcePieceEffect('availableNVA:none', 'saigon:none', 'target:none', false);
    const result = applyEffect(effect, ctx);

    assert.equal(result.state.zones['target:none']?.length, 1, 'piece placed via nested else branch');
    assert.equal(result.state.zones['target:none']?.[0]?.id, 'nva-g-nested');
    assert.equal(result.state.zones['saigon:none']?.length, 0);
  });

  it('nested if/then/else depth 2 skips for US-restricted pieces', () => {
    const ctx = makeCtx({
      'availableNVA:none': [],
      'availableUS:none': [],
      'saigon:none': [token('us-troop-nested', 'US', 'troops')],
      'hue:none': [],
      'target:none': [],
    });

    const effect = buildNestedSourcePieceEffect('availableUS:none', 'saigon:none', 'target:none', true);
    const result = applyEffect(effect, ctx);

    assert.equal(result.state.zones['target:none']?.length, 0, 'no piece placed');
    assert.equal(result.state.zones['saigon:none']?.length, 1, 'map zone unchanged');
  });
});
