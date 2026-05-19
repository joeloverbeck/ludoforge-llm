import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecAgentProfileDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

export const compilePreviewInner = (
  inner: NonNullable<NonNullable<GameSpecAgentProfileDef['preview']>['inner']>,
) => compileGameSpecToGameDef({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'preview-inner-test', players: { min: 2, max: 2 } },
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
          victory: {
            currentMargin: 'public',
          },
        },
      },
    },
  },
  agents: {
    parameters: {},
    library: {
      considerations: {},
      tieBreakers: {
        stableMoveKey: { kind: 'stableMoveKey' },
      },
    },
    profiles: {
      baseline: {
        observer: 'currentPlayer',
        params: {},
        use: { guardrails: [], considerations: [], tieBreakers: ['stableMoveKey'] },
        preview: { mode: 'exactWorld', inner },
      },
    },
    bindings: { us: 'baseline' },
  },
} satisfies GameSpecDoc);

