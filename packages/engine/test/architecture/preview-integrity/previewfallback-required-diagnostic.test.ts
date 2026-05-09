// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecConsiderationDef, GameSpecDoc } from '../../../src/cnl/game-spec-doc.js';

const REQUIRED_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK;
const INVALID_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_FALLBACK_INVALID;

const refExpr = (ref: string) => ({ ref }) as const;

function baseDoc(considerations: Readonly<Record<string, GameSpecConsiderationDef>>): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'previewfallback-required-diagnostic', players: { min: 2, max: 2 } },
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

describe('previewFallback required diagnostic', () => {
  it('rejects preview-option considerations without explicit fallback', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      preferProjectedMargin: {
        scopes: ['microturn'],
        weight: 1,
        value: refExpr('preview.option.delta.victory.currentMargin.self'),
      },
    }));

    const diagnostic = result.diagnostics.find((entry) => entry.code === REQUIRED_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.considerations.preferProjectedMargin.previewFallback');
    assert.match(diagnostic?.message ?? '', /preferProjectedMargin/u);
    assert.match(diagnostic?.message ?? '', /preview\.option\.delta\.victory\.currentMargin\.self/u);
  });

  it('compiles preview-option considerations with noContribution fallback', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      preferProjectedMargin: {
        scopes: ['microturn'],
        weight: 1,
        value: refExpr('preview.option.delta.victory.currentMargin.self'),
        previewFallback: { onUnavailable: 'noContribution' },
      },
    }));

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.deepEqual(
      result.gameDef?.agents?.library.considerations.preferProjectedMargin?.previewFallback,
      { onUnavailable: 'noContribution' },
    );
    assert.deepEqual(
      result.gameDef?.agents?.compiled.considerations.preferProjectedMargin?.previewFallback,
      { onUnavailable: 'noContribution' },
    );
  });

  it('compiles preview-option considerations with explicit constant fallback and unknownAs', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      preferProjectedMargin: {
        scopes: ['microturn'],
        weight: 1,
        value: refExpr('preview.option.delta.victory.currentMargin.self'),
        unknownAs: 7,
        previewFallback: { onUnavailable: { constant: 0 } },
      },
    }));

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.equal(result.gameDef?.agents?.compiled.considerations.preferProjectedMargin?.unknownAs, 7);
    assert.deepEqual(
      result.gameDef?.agents?.compiled.considerations.preferProjectedMargin?.previewFallback,
      { onUnavailable: { kind: 'constant', value: 0 } },
    );
  });

  it('does not require previewFallback for non-preview values', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      staticTerm: {
        scopes: ['move'],
        weight: 1,
        value: 3,
      },
    }));

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.equal(result.gameDef?.agents?.compiled.considerations.staticTerm?.previewFallback, undefined);
  });

  it('rejects non-integer constant fallback values', () => {
    const result = compileGameSpecToGameDef(baseDoc({
      preferProjectedMargin: {
        scopes: ['microturn'],
        weight: 1,
        value: refExpr('preview.option.delta.victory.currentMargin.self'),
        previewFallback: { onUnavailable: { constant: 0.5 } },
      },
    }));

    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((entry) => entry.code === INVALID_CODE), true);
  });
});
