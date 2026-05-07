// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import { GameDefSchema } from '../../../src/kernel/schemas.js';
import type { GameSpecAgentProfileDef, GameSpecConsiderationDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const WARNING_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION;

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'preview-inner-compile-test', players: { min: 2, max: 2 } },
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
        use: { pruningRules: [], considerations: [], tieBreakers: ['stableMoveKey'] },
        preview: { mode: 'exactWorld' },
      },
    },
    bindings: { us: 'baseline' },
  },
});

const refExpr = (ref: string) => ({ ref }) as const;

const withPreview = (
  preview: NonNullable<GameSpecAgentProfileDef['preview']>,
  considerations: Readonly<Record<string, GameSpecConsiderationDef>> = {},
  useConsiderations: readonly string[] = [],
): GameSpecDoc => {
  const doc = baseDoc();
  const agents = doc.agents!;
  return {
    ...doc,
    agents: {
      ...agents,
      library: {
        ...agents.library,
        considerations,
      },
      profiles: {
        baseline: {
          observer: 'currentPlayer',
          params: {},
          use: { pruningRules: [], considerations: useConsiderations, tieBreakers: ['stableMoveKey'] },
          preview,
        },
      },
    },
  };
};

describe('compile preview.inner', () => {
  it('rejects inner preview configs above the hard cap', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { maxOptions: 8, chooseNBeamWidth: 8, depthCap: 8 },
    }));

    assert.equal(
      result.diagnostics.some((diagnostic) => (
        diagnostic.code === 'CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED'
        && diagnostic.path === 'doc.agents.profiles.baseline.preview.inner'
        && diagnostic.message.includes('512')
        && diagnostic.message.includes('256')
      )),
      true,
    );
    assert.equal(result.gameDef, null);
  });

  it('lowers inner preview configs at or below the hard cap', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: {
        chooseOne: true,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 4,
        depthCap: 4,
      },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview.inner, {
      chooseOne: true,
      chooseNStep: true,
      maxOptions: 4,
      chooseNBeamWidth: 4,
      depthCap: 4,
    });
  });

  it('leaves preview.inner absent when not authored', () => {
    const result = compileGameSpecToGameDef(baseDoc());

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.gameDef?.agents?.profiles.baseline?.preview.inner, undefined);
  });

  it('keeps the hard cap at 256', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { maxOptions: 16, chooseNBeamWidth: 16, depthCap: 1 },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.gameDef?.agents?.profiles.baseline?.preview.inner?.maxOptions, 16);
  });

  it('rejects schema artifacts with preview.inner.maxOptions below one', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { maxOptions: 1, chooseNBeamWidth: 1, depthCap: 1 },
    }));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.throws(
      () => GameDefSchema.parse({
        ...result.gameDef,
        agents: {
          ...result.gameDef?.agents,
          profiles: {
            baseline: {
              ...result.gameDef?.agents?.profiles.baseline,
              preview: {
                ...result.gameDef?.agents?.profiles.baseline?.preview,
                inner: { maxOptions: 0, chooseNBeamWidth: 1, depthCap: 1 },
              },
            },
          },
        },
      }),
      /Too small/u,
    );
  });

  it('warns when chooseOne inner preview has no preview-option consideration', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { chooseOne: true, maxOptions: 2, chooseNBeamWidth: 1, depthCap: 4 },
    }));

    const warning = result.diagnostics.find((diagnostic) => (
      diagnostic.code === WARNING_CODE
      && diagnostic.path === 'doc.agents.profiles.baseline.preview.inner.chooseOne'
    ));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(warning?.severity, 'warning');
    assert.match(warning?.message ?? '', /no microturn-scope consideration references preview\.option\.\*/u);
  });

  it('does not warn when chooseOne inner preview has a microturn preview-option consideration', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { chooseOne: true, maxOptions: 2, chooseNBeamWidth: 1, depthCap: 4 },
    }, {
      projectedMargin: {
        scopes: ['microturn'],
        weight: 1,
        value: { coalesce: [refExpr('preview.option.delta.victory.currentMargin.self'), 0] },
      },
    }, ['projectedMargin']));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === WARNING_CODE), false);
  });

  it('does not warn when chooseOne inner preview is disabled', () => {
    const result = compileGameSpecToGameDef(withPreview({
      mode: 'exactWorld',
      inner: { chooseOne: false, maxOptions: 2, chooseNBeamWidth: 1, depthCap: 4 },
    }, {
      moveOnly: {
        scopes: ['move'],
        weight: 1,
        value: 1,
      },
    }, ['moveOnly']));

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === WARNING_CODE), false);
  });
});
