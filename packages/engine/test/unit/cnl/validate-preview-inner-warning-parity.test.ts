// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecAgentProfileDef, GameSpecConsiderationDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const WARNING_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION;
type PreviewInnerConfig = NonNullable<NonNullable<GameSpecAgentProfileDef['preview']>['inner']>;

const refExpr = (ref: string) => ({ ref }) as const;

function createDoc(
  inner: PreviewInnerConfig,
  considerations: Readonly<Record<string, GameSpecConsiderationDef>> = {},
  useConsiderations: readonly string[] = [],
): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'validate-preview-inner-warning-parity-test', players: { min: 2, max: 2 } },
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
        considerations,
        tieBreakers: {
          stableMoveKey: { kind: 'stableMoveKey' },
        },
      },
      profiles: {
        baseline: {
          observer: 'currentPlayer',
          params: {},
          use: {
            pruningRules: [],
            considerations: useConsiderations,
            tieBreakers: ['stableMoveKey'],
          },
          preview: { mode: 'exactWorld', inner },
        },
      },
    },
  };
}

function warningPaths(doc: GameSpecDoc): string[] {
  const result = compileGameSpecToGameDef(doc);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  return result.diagnostics
    .filter((diagnostic) => diagnostic.code === WARNING_CODE)
    .map((diagnostic) => diagnostic.path)
    .sort();
}

describe('preview.inner option warning parity', () => {
  it('warns once for chooseOne when no preview-option consideration exists', () => {
    assert.deepEqual(
      warningPaths(createDoc({ chooseOne: true, maxOptions: 2, chooseNBeamWidth: 1, depthCap: 4 })),
      ['doc.agents.profiles.baseline.preview.inner.chooseOne'],
    );
  });

  it('warns once for chooseNStep when no preview-option consideration exists', () => {
    assert.deepEqual(
      warningPaths(createDoc({ chooseNStep: true, maxOptions: 2, chooseNBeamWidth: 1, depthCap: 4 })),
      ['doc.agents.profiles.baseline.preview.inner.chooseNStep'],
    );
  });

  it('warns once per enabled flag when both flags lack a preview-option consideration', () => {
    assert.deepEqual(
      warningPaths(createDoc({
        chooseOne: true,
        chooseNStep: true,
        maxOptions: 2,
        chooseNBeamWidth: 1,
        depthCap: 4,
      })),
      [
        'doc.agents.profiles.baseline.preview.inner.chooseNStep',
        'doc.agents.profiles.baseline.preview.inner.chooseOne',
      ].sort(),
    );
  });

  it('does not warn for either enabled flag when a preview-option consideration exists', () => {
    const projectedMargin: GameSpecConsiderationDef = {
      scopes: ['microturn'],
      weight: 1,
      value: { coalesce: [refExpr('preview.option.delta.victory.currentMargin.self'), 0] },
    };

    assert.deepEqual(
      warningPaths(createDoc({
        chooseOne: true,
        chooseNStep: true,
        maxOptions: 2,
        chooseNBeamWidth: 1,
        depthCap: 4,
      }, { projectedMargin }, ['projectedMargin'])),
      [],
    );
  });
});
