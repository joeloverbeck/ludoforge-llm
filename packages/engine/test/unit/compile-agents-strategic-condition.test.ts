// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import type { GameSpecAgentLibrary } from '../../src/cnl/game-spec-doc.js';

function createCompileReadyDoc() {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'strat-cond-demo', players: { min: 2, max: 2 } },
    observability: { observers: { testObserver: { surfaces: { victory: { currentMargin: 'public' as const } } } } },
    zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
    tokenTypes: [
      { id: 'soldier', props: {} },
    ],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'act',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
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
      ranking: { order: 'desc' as const },
    },
  };
}

function createSeatCatalogAsset(seatIds: readonly string[]) {
  return {
    id: 'seats',
    kind: 'seatCatalog' as const,
    payload: {
      seats: seatIds.map((seatId) => ({ id: seatId })),
    },
  };
}

function hasErrors(diagnostics: readonly { readonly severity: string }[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

function buildLibrary(
  strategicConditions: GameSpecAgentLibrary['strategicConditions'],
  extras?: Partial<GameSpecAgentLibrary>,
): GameSpecAgentLibrary {
  const base: GameSpecAgentLibrary = {};
  if (strategicConditions !== undefined) {
    (base as Record<string, unknown>)['strategicConditions'] = strategicConditions;
  }
  if (extras !== undefined) {
    for (const [key, value] of Object.entries(extras)) {
      if (value !== undefined) {
        (base as Record<string, unknown>)[key] = value;
      }
    }
  }
  return base;
}

function compileWithConditions(
  strategicConditions: GameSpecAgentLibrary['strategicConditions'],
  extras?: {
    library?: Partial<GameSpecAgentLibrary>;
  },
) {
  return compileGameSpecToGameDef({
    ...createCompileReadyDoc(),
    dataAssets: [createSeatCatalogAsset(['p1', 'p2'])],
    agents: {
      library: buildLibrary(strategicConditions, extras?.library),
      profiles: {},
    },
  });
}

describe('strategic condition compilation', () => {
  it('compiles a boolean-target-only condition successfully', () => {
    const result = compileWithConditions({
      simpleGoal: {
        target: { gte: [{ ref: 'victory.currentMargin.p1' }, 10] },
      },
    });

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const condition = result.gameDef!.agents!.compiled.strategicConditions['simpleGoal'];
    assert.ok(condition, 'simpleGoal should exist in compiled output');
    assert.strictEqual(condition.target.kind, 'op');
    assert.strictEqual(condition.proximity, undefined);
  });

  it('compiles a condition with proximity (numeric current, positive threshold)', () => {
    const result = compileWithConditions({
      withProximity: {
        target: { gte: [{ ref: 'victory.currentMargin.p1' }, 15] },
        proximity: {
          current: { ref: 'victory.currentMargin.p1' },
          threshold: 15,
        },
      },
    });

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const condition = result.gameDef!.agents!.library.strategicConditions['withProximity'];
    assert.ok(condition);
    assert.ok(condition.proximity);
    assert.strictEqual(condition.proximity.threshold, 15);
  });

  it('emits diagnostic for non-boolean target', () => {
    const result = compileWithConditions({
      badTarget: {
        target: { ref: 'victory.currentMargin.p1' },
      },
    });

    assert.equal(hasErrors(result.diagnostics), true, 'Should fail with non-boolean target');
    const diag = result.diagnostics.find((d) => d.path.includes('badTarget') && d.path.includes('target'));
    assert.ok(diag, 'Should have a diagnostic about target type');
    assert.ok(diag.message.includes('boolean'), `Diagnostic message should mention boolean: ${diag.message}`);
  });

  it('emits diagnostic for non-numeric proximity.current', () => {
    const result = compileWithConditions({
      badProxCurrent: {
        target: { gte: [{ ref: 'victory.currentMargin.p1' }, 10] },
        proximity: {
          current: { gte: [{ ref: 'victory.currentMargin.p1' }, 5] },
          threshold: 10,
        },
      },
    });

    assert.equal(hasErrors(result.diagnostics), true, 'Should fail with non-numeric proximity.current');
    const diag = result.diagnostics.find((d) => d.path.includes('proximity.current'));
    assert.ok(diag, 'Should have a diagnostic about proximity.current type');
    assert.ok(diag.message.includes('numeric'), `Diagnostic message should mention numeric: ${diag.message}`);
  });

  it('emits diagnostic for threshold <= 0', () => {
    const result = compileWithConditions({
      badThreshold: {
        target: { gte: [{ ref: 'victory.currentMargin.p1' }, 10] },
        proximity: {
          current: { ref: 'victory.currentMargin.p1' },
          threshold: 0,
        },
      },
    });

    assert.equal(hasErrors(result.diagnostics), true, 'Should fail with threshold <= 0');
    const diag = result.diagnostics.find((d) => d.path.includes('threshold'));
    assert.ok(diag, 'Should have a diagnostic about threshold');
    assert.ok(diag.message.includes('> 0'), `Diagnostic message should mention > 0: ${diag.message}`);
  });

  it('emits diagnostic for negative threshold', () => {
    const result = compileWithConditions({
      negThreshold: {
        target: { gte: [{ ref: 'victory.currentMargin.p1' }, 10] },
        proximity: {
          current: { ref: 'victory.currentMargin.p1' },
          threshold: -5,
        },
      },
    });

    assert.equal(hasErrors(result.diagnostics), true, 'Should fail with negative threshold');
    const diag = result.diagnostics.find((d) => d.path.includes('threshold'));
    assert.ok(diag);
  });

  it('compiles cross-condition reference (condition.A referencing condition.B.satisfied)', () => {
    const result = compileWithConditions({
      condA: {
        target: { gte: [{ ref: 'victory.currentMargin.p1' }, 5] },
      },
      condB: {
        target: { ref: 'condition.condA.satisfied' },
      },
    });

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const catalog = result.gameDef!.agents!.library;
    assert.ok(catalog.strategicConditions['condA']);
    assert.ok(catalog.strategicConditions['condB']);
  });

  it('emits diagnostic for cyclic cross-condition reference (A → B → A)', () => {
    const result = compileWithConditions({
      cycleA: {
        target: { ref: 'condition.cycleB.satisfied' },
      },
      cycleB: {
        target: { ref: 'condition.cycleA.satisfied' },
      },
    });

    assert.equal(hasErrors(result.diagnostics), true, 'Should fail with cyclic reference');
    const cycleDiag = result.diagnostics.find((d) => d.message.includes('cycle'));
    assert.ok(cycleDiag, 'Should detect dependency cycle');
  });

  it('compiled output includes correct strategicConditions in the library index', () => {
    const result = compileWithConditions({
      goalOne: {
        target: { gte: [{ ref: 'victory.currentMargin.p1' }, 3] },
        proximity: {
          current: { ref: 'victory.currentMargin.p1' },
          threshold: 3,
        },
      },
      goalTwo: {
        target: { eq: [{ ref: 'victory.currentMargin.p2' }, 0] },
      },
    });

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const conditions = result.gameDef!.agents!.library.strategicConditions;
    assert.ok(conditions['goalOne']);
    assert.ok(conditions['goalTwo']);
    assert.ok(conditions['goalOne'].proximity);
    assert.strictEqual(conditions['goalTwo'].proximity, undefined);
  });

  it('dependency refs correctly list referenced strategic conditions', () => {
    const result = compileWithConditions(
      {
        baseCondition: {
          target: { gte: [{ ref: 'victory.currentMargin.p1' }, 5] },
          proximity: {
            current: { ref: 'victory.currentMargin.p1' },
            threshold: 5,
          },
        },
      },
      {
        library: {
          stateFeatures: {
            condCheck: {
              type: 'boolean',
              expr: { ref: 'condition.baseCondition.satisfied' },
            },
          },
          considerations: {
            useCondition: {
              scopes: ['move'],
              weight: 1,
              value: { ref: 'condition.baseCondition.proximity' },
            },
          },
        },
      },
    );

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const catalog = result.gameDef!.agents!;

    const condCheckFeature = catalog.library.stateFeatures['condCheck'];
    assert.ok(condCheckFeature, 'condCheck feature should exist');
    const featureDeps = condCheckFeature.dependencies;
    assert.ok(
      featureDeps.strategicConditions.includes('baseCondition'),
      `stateFeature deps should include baseCondition: ${JSON.stringify(featureDeps.strategicConditions)}`,
    );

    const useCondition = catalog.library.considerations['useCondition'];
    assert.ok(useCondition, 'useCondition consideration should exist');
    const scoreTermDeps = useCondition.dependencies;
    assert.ok(
      scoreTermDeps.strategicConditions.includes('baseCondition'),
      `scoreTerm deps should include baseCondition: ${JSON.stringify(scoreTermDeps.strategicConditions)}`,
    );
  });

  it('emits diagnostic when referencing non-existent condition', () => {
    const result = compileWithConditions(
      undefined,
      {
        library: {
          stateFeatures: {
            badRef: {
              type: 'boolean',
              expr: { ref: 'condition.nonExistent.satisfied' },
            },
          },
        },
      },
    );

    assert.equal(hasErrors(result.diagnostics), true, 'Should fail with non-existent condition ref');
    const diag = result.diagnostics.find((d) => d.message.includes('nonExistent'));
    assert.ok(diag, 'Should have a diagnostic about unknown condition');
  });

  it('emits diagnostic when referencing proximity on a condition without proximity', () => {
    const result = compileWithConditions(
      {
        noProx: {
          target: { gte: [{ ref: 'victory.currentMargin.p1' }, 5] },
        },
      },
      {
        library: {
          stateFeatures: {
            badProxRef: {
              type: 'number',
              expr: { ref: 'condition.noProx.proximity' },
            },
          },
        },
      },
    );

    assert.equal(hasErrors(result.diagnostics), true, 'Should fail referencing proximity on condition without it');
    const diag = result.diagnostics.find((d) => d.message.includes('no proximity'));
    assert.ok(diag, 'Should have a diagnostic about missing proximity');
  });

  it('emits diagnostic for invalid condition ref field (not satisfied/proximity)', () => {
    const result = compileWithConditions(
      {
        someCondition: {
          target: { gte: [{ ref: 'victory.currentMargin.p1' }, 5] },
        },
      },
      {
        library: {
          stateFeatures: {
            badField: {
              type: 'number',
              expr: { ref: 'condition.someCondition.badField' },
            },
          },
        },
      },
    );

    assert.equal(hasErrors(result.diagnostics), true, 'Should fail with invalid field');
  });

  it('games without strategic conditions compile cleanly', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['p1', 'p2'])],
      agents: {
        library: buildLibrary(undefined, {
          stateFeatures: {
            margin: {
              type: 'number',
              expr: { ref: 'victory.currentMargin.p1' },
            },
          },
        }),
        profiles: {},
      },
    });

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const conditions = result.gameDef!.agents!.library.strategicConditions;
    assert.deepStrictEqual(conditions, {});
  });
});
