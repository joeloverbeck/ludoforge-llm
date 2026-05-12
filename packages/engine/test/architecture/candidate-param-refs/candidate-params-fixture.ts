// @test-class: architectural-invariant
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

export const candidateParamRef = (name: string) => `candidate.params.${name}`;

export function createCandidateParamsDoc(agents: Record<string, unknown>): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'candidate-param-refs', players: { min: 2, max: 2 } },
    dataAssets: [{
      id: 'seat-catalog',
      kind: 'seatCatalog',
      payload: { seats: [{ id: 'p1' }, { id: 'p2' }] },
    }],
    observability: {
      observers: {
        testObserver: {
          surfaces: {},
        },
      },
    },
    zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'chooseMode',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [
          { name: 'mode', domain: { query: 'enums', values: ['A', 'B'] } },
          { name: 'urgent', domain: { query: 'booleans', values: [true, false] } },
        ],
        pre: null,
        cost: [],
        effects: [
          {
            chooseN: {
              internalDecisionId: 'chooseTargets',
              bind: '$targets',
              options: { query: 'enums', values: ['alpha', 'beta'] },
              n: 2,
            },
          },
        ],
        limits: [],
      },
      {
        id: 'chooseRole',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [
          { name: 'role', domain: { query: 'enums', values: ['red', 'blue'] } },
          { name: 'urgent', domain: { query: 'booleans', values: [true, false] } },
        ],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [
        { seat: 'p1', value: 0 },
        { seat: 'p2', value: 0 },
      ],
      ranking: { order: 'desc' },
    },
    agents: withObserver(agents),
  } as GameSpecDoc;
}

export function compileCandidateParamsDoc(agents: Record<string, unknown>) {
  return compileGameSpecToGameDef(createCandidateParamsDoc(agents));
}

export function baselineAgents(considerations: Record<string, unknown>): Record<string, unknown> {
  return {
    parameters: {},
    library: {
      considerations,
      tieBreakers: {
        stableMoveKey: { kind: 'stableMoveKey' },
      },
    },
    profiles: {
      baseline: {
        params: {},
        use: {
          pruningRules: [],
          considerations: Object.keys(considerations),
          tieBreakers: ['stableMoveKey'],
        },
      },
    },
    bindings: {
      p1: 'baseline',
    },
  };
}

export function withObserver(agents: Record<string, unknown>): Record<string, unknown> {
  const profiles = agents.profiles as Record<string, Record<string, unknown>> | undefined;
  if (profiles === undefined) {
    return agents;
  }
  const patched: Record<string, unknown> = {};
  for (const [id, profile] of Object.entries(profiles)) {
    patched[id] = { observer: 'testObserver', ...profile };
  }
  return { ...agents, profiles: patched };
}
