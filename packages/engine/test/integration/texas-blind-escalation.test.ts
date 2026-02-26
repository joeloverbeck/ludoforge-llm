import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffects,
  asPlayerId,
  assertValidatedGameDef,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  initialState,
  type EffectAST,
  type GameDef,
} from '../../src/kernel/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const loadEscalateMacro = (): { readonly def: GameDef; readonly effects: readonly EffectAST[] } => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  assert.notEqual(compiled.gameDef, null);

  const def = assertValidatedGameDef(compiled.gameDef!);
  const handCleanup = def.turnStructure.phases.find((phase) => phase.id === 'hand-cleanup');
  assert.ok(handCleanup);
  const escalateBlinds = (handCleanup?.onEnter ?? []).find((effect) => JSON.stringify(effect).includes('"var":"blindLevel"'));
  assert.ok(escalateBlinds);

  return {
    def: structuredClone(def),
    effects: [escalateBlinds as EffectAST],
  };
};

const runEscalate = (
  def: GameDef,
  effects: readonly EffectAST[],
  globalVars: {
    readonly handsPlayed: number;
    readonly blindLevel: number;
    readonly smallBlind: number;
    readonly bigBlind: number;
    readonly ante: number;
  },
) => {
  const seedState = initialState(def, 71, 4).state;
  const state = {
    ...seedState,
    globalVars: {
      ...seedState.globalVars,
      handsPlayed: globalVars.handsPlayed,
      blindLevel: globalVars.blindLevel,
      smallBlind: globalVars.smallBlind,
      bigBlind: globalVars.bigBlind,
      ante: globalVars.ante,
    },
  };

  return applyEffects(effects, {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    rng: createRng(19n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams: {},
    collector: createCollector(),
    mode: 'execution',
  }).state.globalVars;
};

describe('texas blind escalation macro', () => {
  it('does not escalate before the next schedule threshold', () => {
    const { def, effects } = loadEscalateMacro();
    const vars = runEscalate(def, effects, {
      handsPlayed: 9,
      blindLevel: 0,
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
    });

    assert.equal(vars.blindLevel, 0);
    assert.equal(vars.smallBlind, 10);
    assert.equal(vars.bigBlind, 20);
    assert.equal(vars.ante, 0);
  });

  it('escalates to the next blind schedule row at the threshold boundary', () => {
    const { def, effects } = loadEscalateMacro();
    const vars = runEscalate(def, effects, {
      handsPlayed: 10,
      blindLevel: 0,
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
    });

    assert.equal(vars.blindLevel, 1);
    assert.equal(vars.smallBlind, 15);
    assert.equal(vars.bigBlind, 30);
    assert.equal(vars.ante, 0);
  });

  it('derives later-level transition boundaries from handsUntilNext schedule data', () => {
    const { def, effects } = loadEscalateMacro();

    const beforeBoundary = runEscalate(def, effects, {
      handsPlayed: 37,
      blindLevel: 3,
      smallBlind: 50,
      bigBlind: 100,
      ante: 10,
    });
    assert.equal(beforeBoundary.blindLevel, 3);
    assert.equal(beforeBoundary.smallBlind, 50);
    assert.equal(beforeBoundary.bigBlind, 100);
    assert.equal(beforeBoundary.ante, 10);

    const atBoundary = runEscalate(def, effects, {
      handsPlayed: 38,
      blindLevel: 3,
      smallBlind: 50,
      bigBlind: 100,
      ante: 10,
    });
    assert.equal(atBoundary.blindLevel, 4);
    assert.equal(atBoundary.smallBlind, 75);
    assert.equal(atBoundary.bigBlind, 150);
    assert.equal(atBoundary.ante, 15);
  });

  it('fails validation explicitly when next blind level row is missing from schedule data', () => {
    const { def, effects } = loadEscalateMacro();
    const malformedDef: GameDef = {
      ...def,
      runtimeDataAssets: (def.runtimeDataAssets ?? []).map((asset) => {
        if (asset.id !== 'tournament-standard') {
          return asset;
        }

        const payload = asset.payload as { readonly settings?: { readonly blindSchedule?: readonly Record<string, unknown>[] } };
        const schedule = payload.settings?.blindSchedule;
        if (schedule === undefined) {
          return asset;
        }

        return {
          ...asset,
          payload: {
            ...payload,
            settings: {
              ...(payload.settings ?? {}),
              blindSchedule: schedule.filter((row) => row['level'] !== 1),
            },
          },
        };
      }),
    };

    assert.throws(
      () =>
        runEscalate(malformedDef, effects, {
          handsPlayed: 10,
          blindLevel: 0,
          smallBlind: 10,
          bigBlind: 20,
          ante: 0,
        }),
      (error: unknown) => error instanceof Error && error.message.includes('RUNTIME_TABLE_CONSTRAINT_CONTIGUOUS_VIOLATION'),
    );
  });

  it('stays at the final blind level without querying a non-existent next row', () => {
    const { def, effects } = loadEscalateMacro();

    const vars = runEscalate(def, effects, {
      handsPlayed: 10_000,
      blindLevel: 9,
      smallBlind: 500,
      bigBlind: 1000,
      ante: 100,
    });

    assert.equal(vars.blindLevel, 9);
    assert.equal(vars.smallBlind, 500);
    assert.equal(vars.bigBlind, 1000);
    assert.equal(vars.ante, 100);
  });
});
