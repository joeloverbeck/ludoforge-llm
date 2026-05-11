import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecConsiderationDef, GameSpecDoc, GameSpecPolicyExpr } from '../../../src/cnl/game-spec-doc.js';

export const projectedLookupRefId = 'lookup.previewOptionState.zones.variables.population';
export const policyStateLookupRefId = 'lookup.policyState.zones.properties.population';

export function projectedLookupExpr(key: GameSpecPolicyExpr = { ref: 'microturn.option.value' }): GameSpecPolicyExpr {
  return {
    lookup: {
      surface: 'previewOptionState',
      collection: 'zones',
      keyType: 'ZoneId',
      key,
      path: ['variables', 'population'],
      onMissing: 'unavailable',
    },
  };
}

export function policyStateLookupExpr(): GameSpecPolicyExpr {
  return {
    lookup: {
      surface: 'policyState',
      collection: 'zones',
      keyType: 'ZoneId',
      key: { ref: 'microturn.option.value' },
      path: ['properties', 'population'],
      onMissing: 'unavailable',
    },
  };
}

export function baseProjectedLookupDoc(
  considerations: Readonly<Record<string, GameSpecConsiderationDef>>,
): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'projected-lookup-compiler-contract', players: { min: 2, max: 2 } },
    dataAssets: [{
      id: 'seat-catalog',
      kind: 'seatCatalog',
      payload: { seats: [{ id: 'us' }, { id: 'them' }] },
    }],
    zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    terminal: {
      conditions: [],
      margins: [{ seat: 'us', value: 0 }, { seat: 'them', value: 0 }],
      ranking: { order: 'desc' },
    },
    observability: {
      observers: {
        currentPlayer: {
          surfaces: {
            victory: { currentMargin: 'public' },
          },
          zones: {
            board: { tokens: 'public', order: 'public' },
          },
        },
      },
    },
    agents: {
      parameters: {},
      library: {
        considerations,
        tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
      },
      profiles: {
        baseline: {
          observer: 'currentPlayer',
          params: {},
          use: {
            pruningRules: [],
            considerations: Object.keys(considerations),
            tieBreakers: ['stableMoveKey'],
          },
          preview: { mode: 'exactWorld' },
        },
      },
      bindings: { us: 'baseline' },
    },
  };
}

export function compileProjectedLookupConsiderations(
  considerations: Readonly<Record<string, GameSpecConsiderationDef>>,
) {
  return compileGameSpecToGameDef(baseProjectedLookupDoc(considerations));
}
