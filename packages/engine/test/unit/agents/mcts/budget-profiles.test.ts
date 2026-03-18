import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUDGET_PROFILES,
  BUDGET_PROFILE_NAMES,
  resolveBudgetProfile,
  MCTS_PRESET_NAMES,
  resolvePreset,
  validateMctsConfig,
  type MctsBudgetProfile,
} from '../../../../src/agents/mcts/config.js';
import { MctsAgent } from '../../../../src/agents/mcts/mcts-agent.js';
import {
  fallbackPolicyOnly,
  fallbackSampledOnePly,
  dispatchFallback,
} from '../../../../src/agents/mcts/mcts-agent.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * 2-player game with two actions: "win" and "noop".
 */
function createTwoActionDef(): GameDef {
  return {
    metadata: { id: 'budget-profile-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'ended', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('win'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'ended', value: 1 } }],
        limits: [],
      },
      {
        id: asActionId('noop'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: { op: '==', left: { ref: 'gvar', var: 'ended' }, right: 1 },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
      ],
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Budget profile resolution
// ---------------------------------------------------------------------------

describe('MctsBudgetProfile', () => {
  it('BUDGET_PROFILE_NAMES contains exactly interactive, turn, background, analysis', () => {
    assert.deepEqual(
      [...BUDGET_PROFILE_NAMES].sort(),
      ['analysis', 'background', 'interactive', 'turn'],
    );
  });

  it('BUDGET_PROFILES is frozen', () => {
    assert.ok(Object.isFrozen(BUDGET_PROFILES));
  });

  it('each budget profile partial is frozen', () => {
    for (const name of BUDGET_PROFILE_NAMES) {
      assert.ok(Object.isFrozen(BUDGET_PROFILES[name]), `BUDGET_PROFILES.${name} should be frozen`);
    }
  });
});

describe('resolveBudgetProfile', () => {
  it('interactive: ~200 iterations, 2s time limit, heuristic leaf eval, lazy classification', () => {
    const cfg = resolveBudgetProfile('interactive');
    assert.equal(cfg.iterations, 200);
    assert.equal(cfg.minIterations, 8);
    assert.equal(cfg.timeLimitMs, 2_000);
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
    assert.equal(cfg.classificationPolicy, 'lazy');
    assert.equal(cfg.fallbackPolicy, 'policyOnly');
    assert.equal(cfg.rootStopMinVisits, 4);
    assert.equal(cfg.heuristicTemperature, 2_000);
    assert.equal(cfg.heuristicBackupAlpha, 0.3);
  });

  it('turn: ~1500 iterations, 10s time limit, family widening enabled', () => {
    const cfg = resolveBudgetProfile('turn');
    assert.equal(cfg.iterations, 1500);
    assert.equal(cfg.minIterations, 64);
    assert.equal(cfg.timeLimitMs, 10_000);
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
    assert.equal(cfg.wideningMode, 'familyThenMove');
    assert.equal(cfg.fallbackPolicy, 'sampledOnePly');
    assert.equal(cfg.heuristicTemperature, 3_000);
  });

  it('background: ~5000 iterations, 30s time limit', () => {
    const cfg = resolveBudgetProfile('background');
    assert.equal(cfg.iterations, 5000);
    assert.equal(cfg.minIterations, 128);
    assert.equal(cfg.timeLimitMs, 30_000);
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
    assert.equal(cfg.fallbackPolicy, 'sampledOnePly');
    assert.equal(cfg.heuristicBackupAlpha, 0.4);
    assert.equal(cfg.heuristicTemperature, 5_000);
  });

  it('analysis: large iterations, may use rollout (auto evaluator)', () => {
    const cfg = resolveBudgetProfile('analysis');
    assert.equal(cfg.iterations, 20_000);
    assert.deepEqual(cfg.leafEvaluator, { type: 'auto' });
    assert.equal(cfg.fallbackPolicy, 'none');
    assert.equal(cfg.timeLimitMs, undefined);
  });

  it('all budget profiles pass validateMctsConfig', () => {
    for (const name of BUDGET_PROFILE_NAMES) {
      assert.doesNotThrow(
        () => resolveBudgetProfile(name),
        `budget profile "${name}" should validate`,
      );
    }
  });

  it('resolved budget profiles are frozen/immutable', () => {
    for (const name of BUDGET_PROFILE_NAMES) {
      const cfg = resolveBudgetProfile(name);
      assert.ok(Object.isFrozen(cfg), `resolved "${name}" should be frozen`);
    }
  });
});

// ---------------------------------------------------------------------------
// fallbackPolicy config field validation
// ---------------------------------------------------------------------------

describe('fallbackPolicy config validation', () => {
  it('defaults to undefined when not provided', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.fallbackPolicy, undefined);
  });

  it('accepts "none"', () => {
    const cfg = validateMctsConfig({ fallbackPolicy: 'none' });
    assert.equal(cfg.fallbackPolicy, 'none');
  });

  it('accepts "policyOnly"', () => {
    const cfg = validateMctsConfig({ fallbackPolicy: 'policyOnly' });
    assert.equal(cfg.fallbackPolicy, 'policyOnly');
  });

  it('accepts "sampledOnePly"', () => {
    const cfg = validateMctsConfig({ fallbackPolicy: 'sampledOnePly' });
    assert.equal(cfg.fallbackPolicy, 'sampledOnePly');
  });

  it('accepts "flatMonteCarlo"', () => {
    const cfg = validateMctsConfig({ fallbackPolicy: 'flatMonteCarlo' });
    assert.equal(cfg.fallbackPolicy, 'flatMonteCarlo');
  });

  it('rejects invalid fallbackPolicy', () => {
    assert.throws(
      () => validateMctsConfig({ fallbackPolicy: 'invalid' as 'none' }),
      (err: unknown) =>
        err instanceof TypeError && /fallbackPolicy/.test((err as TypeError).message),
    );
  });
});

// ---------------------------------------------------------------------------
// Fallback policy dispatch
// ---------------------------------------------------------------------------

describe('fallback policies', () => {
  const def = createTwoActionDef();
  const playerCount = 2;
  const runtime = createGameDefRuntime(def);

  function getStateAndMoves() {
    const { state } = initialState(def, 42, playerCount);
    const moves = legalMoves(def, state, undefined, runtime);
    return { state, moves };
  }

  describe('policyOnly', () => {
    it('returns a move without running search iterations', () => {
      const { state, moves } = getStateAndMoves();
      assert.ok(moves.length >= 2, 'should have at least 2 legal moves');

      const rng = createRng(99n);
      const result = fallbackPolicyOnly(
        def, state, asPlayerId(0), moves, rng, runtime, 10_000,
      );

      assert.ok(result.move !== null && result.move !== undefined);
      // The returned move must be one of the legal moves.
      const moveKeys = moves.map((m) => JSON.stringify(m));
      assert.ok(
        moveKeys.includes(JSON.stringify(result.move)),
        'fallback policyOnly should return a legal move',
      );
    });
  });

  describe('sampledOnePly', () => {
    it('evaluates shortlist-size or fewer candidates', () => {
      const { state, moves } = getStateAndMoves();
      const rng = createRng(77n);
      const result = fallbackSampledOnePly(
        def, state, asPlayerId(0), moves, rng, runtime, 10_000, 4,
      );

      assert.ok(result.move !== null && result.move !== undefined);
      const moveKeys = moves.map((m) => JSON.stringify(m));
      assert.ok(
        moveKeys.includes(JSON.stringify(result.move)),
        'fallback sampledOnePly should return a legal move',
      );
    });
  });

  describe('dispatchFallback', () => {
    it('returns null for fallbackPolicy "none"', () => {
      const { state, moves } = getStateAndMoves();
      const rng = createRng(42n);
      const result = dispatchFallback(
        'none', def, state, asPlayerId(0), moves, rng, runtime, 10_000,
      );
      assert.equal(result, null);
    });

    it('returns null for undefined fallbackPolicy', () => {
      const { state, moves } = getStateAndMoves();
      const rng = createRng(42n);
      const result = dispatchFallback(
        undefined, def, state, asPlayerId(0), moves, rng, runtime, 10_000,
      );
      assert.equal(result, null);
    });

    it('returns a move for fallbackPolicy "policyOnly"', () => {
      const { state, moves } = getStateAndMoves();
      const rng = createRng(42n);
      const result = dispatchFallback(
        'policyOnly', def, state, asPlayerId(0), moves, rng, runtime, 10_000,
      );
      assert.ok(result !== null);
      assert.ok(result!.move !== null);
    });

    it('returns a move for fallbackPolicy "sampledOnePly"', () => {
      const { state, moves } = getStateAndMoves();
      const rng = createRng(42n);
      const result = dispatchFallback(
        'sampledOnePly', def, state, asPlayerId(0), moves, rng, runtime, 10_000,
      );
      assert.ok(result !== null);
      assert.ok(result!.move !== null);
    });

    it('returns a move for fallbackPolicy "flatMonteCarlo"', () => {
      const { state, moves } = getStateAndMoves();
      const rng = createRng(42n);
      const result = dispatchFallback(
        'flatMonteCarlo', def, state, asPlayerId(0), moves, rng, runtime, 10_000,
      );
      assert.ok(result !== null);
      assert.ok(result!.move !== null);
    });
  });
});

// ---------------------------------------------------------------------------
// MctsAgent budget profile constructor
// ---------------------------------------------------------------------------

describe('MctsAgent budget profile constructor', () => {
  it('accepts a budget profile name string', () => {
    const agent = new MctsAgent('interactive');
    assert.equal(agent.config.iterations, 200);
    assert.equal(agent.config.minIterations, 8);
    assert.equal(agent.config.timeLimitMs, 2_000);
    assert.equal(agent.config.fallbackPolicy, 'policyOnly');
    assert.equal(agent.config.heuristicTemperature, 2_000);
    assert.equal(agent.config.heuristicBackupAlpha, 0.3);
  });

  it('accepts "turn" profile', () => {
    const agent = new MctsAgent('turn');
    assert.equal(agent.config.iterations, 1500);
    assert.equal(agent.config.wideningMode, 'familyThenMove');
  });

  it('accepts raw MctsConfig partial (backward compat)', () => {
    const agent = new MctsAgent({ iterations: 42 });
    assert.equal(agent.config.iterations, 42);
  });

  it('accepts empty object (backward compat)', () => {
    const agent = new MctsAgent({});
    assert.equal(agent.config.iterations, 1500); // DEFAULT_MCTS_CONFIG.iterations
  });

  it('accepts no argument (backward compat)', () => {
    const agent = new MctsAgent();
    assert.equal(agent.config.iterations, 1500);
  });

  it('throws for unknown profile name', () => {
    assert.throws(
      () => new MctsAgent('invalid_profile' as MctsBudgetProfile),
      (err: unknown) => err instanceof Error && /Unknown budget profile/.test(err.message),
    );
  });
});

// ---------------------------------------------------------------------------
// Old presets still work (deprecated but functional)
// ---------------------------------------------------------------------------

describe('old resolvePreset backward compatibility', () => {
  it('resolvePreset("fast") still works', () => {
    const cfg = resolvePreset('fast');
    assert.equal(cfg.iterations, 200);
    assert.equal(cfg.timeLimitMs, 2_000);
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
  });

  it('resolvePreset("default") still works', () => {
    const cfg = resolvePreset('default');
    assert.equal(cfg.timeLimitMs, 10_000);
  });

  it('resolvePreset("strong") still works', () => {
    const cfg = resolvePreset('strong');
    assert.equal(cfg.iterations, 5000);
  });

  it('all old presets still validate', () => {
    for (const name of MCTS_PRESET_NAMES) {
      assert.doesNotThrow(() => resolvePreset(name), `preset "${name}" should validate`);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe('budget profile invariants', () => {
  it('raw MctsConfig still supported — profiles are optional convenience', () => {
    const cfg = validateMctsConfig({ iterations: 999, fallbackPolicy: 'policyOnly' });
    assert.equal(cfg.iterations, 999);
    assert.equal(cfg.fallbackPolicy, 'policyOnly');
  });

  it('fallbackPolicy "none" means no degradation', () => {
    const cfg = validateMctsConfig({ fallbackPolicy: 'none' });
    assert.equal(cfg.fallbackPolicy, 'none');
    // dispatchFallback with 'none' returns null — tested above.
  });

  it('interactive has lower minIterations and rootStopMinVisits than turn', () => {
    const interactive = resolveBudgetProfile('interactive');
    const turn = resolveBudgetProfile('turn');
    assert.ok(
      interactive.minIterations < turn.minIterations,
      `interactive.minIterations (${interactive.minIterations}) should be < turn.minIterations (${turn.minIterations})`,
    );
    assert.ok(
      interactive.rootStopMinVisits! < turn.rootStopMinVisits!,
      `interactive.rootStopMinVisits (${interactive.rootStopMinVisits}) should be < turn.rootStopMinVisits (${turn.rootStopMinVisits})`,
    );
  });

  it('no game-specific logic in profiles', () => {
    // All profiles should only use game-agnostic MctsConfig fields.
    for (const name of BUDGET_PROFILE_NAMES) {
      const partial = BUDGET_PROFILES[name];
      const keys = Object.keys(partial);
      // None of these keys should reference game-specific concepts.
      for (const key of keys) {
        assert.ok(
          key in ({
            iterations: 1, minIterations: 1, timeLimitMs: 1, maxSimulationDepth: 1,
            leafEvaluator: 1, classificationPolicy: 1, wideningMode: 1, fallbackPolicy: 1,
            decisionWideningCap: 1, decisionDepthMultiplier: 1, rootStopMinVisits: 1,
            heuristicBackupAlpha: 1, heuristicTemperature: 1,
            explorationConstant: 1, progressiveWideningK: 1,
            progressiveWideningAlpha: 1,
          }),
          `profile "${name}" has unexpected key "${key}" — check for game-specific logic`,
        );
      }
    }
  });
});
