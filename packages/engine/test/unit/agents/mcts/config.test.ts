import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_MCTS_CONFIG,
  MCTS_PRESETS,
  MCTS_PRESET_NAMES,
  validateMctsConfig,
  resolvePreset,
  type MctsConfig,
  type LeafEvaluator,
} from '../../../../src/agents/mcts/config.js';
import type { MctsSearchVisitor } from '../../../../src/agents/mcts/visitor.js';

describe('MctsConfig defaults', () => {
  it('DEFAULT_MCTS_CONFIG has all required fields with spec-defined values', () => {
    const expected: MctsConfig = {
      iterations: 1500,
      minIterations: 128,
      explorationConstant: 1.4,
      maxSimulationDepth: 48,
      progressiveWideningK: 2.0,
      progressiveWideningAlpha: 0.5,
      heuristicTemperature: 10_000,
      solverMode: 'off',
      leafEvaluator: { type: 'heuristic' },
      compressForcedSequences: true,
      rootStopConfidenceDelta: 1e-3,
      rootStopMinVisits: 16,
      decisionWideningCap: 12,
      decisionDepthMultiplier: 4,
    };
    assert.deepEqual(DEFAULT_MCTS_CONFIG, expected);
  });

  it('DEFAULT_MCTS_CONFIG does not include diagnostics by default', () => {
    assert.equal(DEFAULT_MCTS_CONFIG.diagnostics, undefined);
  });
});

describe('validateMctsConfig', () => {
  it('returns DEFAULT_MCTS_CONFIG unchanged when called with empty object', () => {
    const result = validateMctsConfig({});
    assert.deepEqual(result, DEFAULT_MCTS_CONFIG);
  });

  it('overrides only the provided field when given { iterations: 500 }', () => {
    const result = validateMctsConfig({ iterations: 500 });
    assert.equal(result.iterations, 500);
    assert.equal(result.explorationConstant, DEFAULT_MCTS_CONFIG.explorationConstant);
  });

  it('throws RangeError when iterations is 0', () => {
    assert.throws(
      () => validateMctsConfig({ iterations: 0 }),
      (err: unknown) => err instanceof RangeError && /iterations/.test((err as RangeError).message),
    );
  });

  it('throws RangeError when iterations is negative', () => {
    assert.throws(
      () => validateMctsConfig({ iterations: -1 }),
      (err: unknown) => err instanceof RangeError && /iterations/.test((err as RangeError).message),
    );
  });

  it('throws RangeError when explorationConstant is 0', () => {
    assert.throws(
      () => validateMctsConfig({ explorationConstant: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /explorationConstant/.test((err as RangeError).message),
    );
  });

  it('throws TypeError when solverMode is invalid', () => {
    assert.throws(
      () => validateMctsConfig({ solverMode: 'invalid' as 'off' }),
      (err: unknown) => err instanceof TypeError && /solverMode/.test((err as TypeError).message),
    );
  });

  it('preserves diagnostics when explicitly set', () => {
    const result = validateMctsConfig({ diagnostics: true });
    assert.equal(result.diagnostics, true);
  });

  it('throws RangeError for non-positive maxSimulationDepth', () => {
    assert.throws(
      () => validateMctsConfig({ maxSimulationDepth: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /maxSimulationDepth/.test((err as RangeError).message),
    );
  });

  it('throws RangeError for non-positive heuristicTemperature', () => {
    assert.throws(
      () => validateMctsConfig({ heuristicTemperature: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /heuristicTemperature/.test((err as RangeError).message),
    );
  });

  it('accepts valid boundary values', () => {
    const result = validateMctsConfig({
      iterations: 1,
      minIterations: 0,
      explorationConstant: 0.001,
    });
    assert.equal(result.iterations, 1);
    assert.equal(result.minIterations, 0);
    assert.equal(result.explorationConstant, 0.001);
  });
});

// ---------------------------------------------------------------------------
// LeafEvaluator validation
// ---------------------------------------------------------------------------

describe('LeafEvaluator validation', () => {
  it('defaults to heuristic when leafEvaluator is undefined', () => {
    const cfg = validateMctsConfig({});
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
  });

  it('accepts leafEvaluator: { type: "heuristic" }', () => {
    const cfg = validateMctsConfig({ leafEvaluator: { type: 'heuristic' } });
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
  });

  it('accepts leafEvaluator: { type: "auto" }', () => {
    const cfg = validateMctsConfig({ leafEvaluator: { type: 'auto' } });
    assert.deepEqual(cfg.leafEvaluator, { type: 'auto' });
  });

  it('accepts rollout evaluator with required fields', () => {
    const evaluator: LeafEvaluator = {
      type: 'rollout',
      maxSimulationDepth: 48,
      policy: 'mast',
    };
    const cfg = validateMctsConfig({ leafEvaluator: evaluator });
    assert.equal(cfg.leafEvaluator!.type, 'rollout');
  });

  it('accepts rollout evaluator with all optional fields', () => {
    const evaluator: LeafEvaluator = {
      type: 'rollout',
      maxSimulationDepth: 48,
      policy: 'epsilonGreedy',
      epsilon: 0.15,
      candidateSample: 6,
      mastWarmUpThreshold: 32,
      templateCompletionsPerVisit: 2,
      mode: 'hybrid',
      hybridCutoffDepth: 6,
    };
    const cfg = validateMctsConfig({ leafEvaluator: evaluator });
    assert.equal(cfg.leafEvaluator!.type, 'rollout');
  });

  it('throws TypeError for invalid leafEvaluator type', () => {
    assert.throws(
      () => validateMctsConfig({ leafEvaluator: { type: 'invalid' } as unknown as LeafEvaluator }),
      (err: unknown) =>
        err instanceof TypeError && /leafEvaluator\.type/.test((err as TypeError).message),
    );
  });

  it('throws TypeError for invalid rollout policy', () => {
    assert.throws(
      () => validateMctsConfig({
        leafEvaluator: {
          type: 'rollout',
          maxSimulationDepth: 48,
          policy: 'invalid' as 'random',
        },
      }),
      (err: unknown) =>
        err instanceof TypeError && /leafEvaluator\.policy/.test((err as TypeError).message),
    );
  });

  it('throws RangeError for rollout epsilon out of range', () => {
    assert.throws(
      () => validateMctsConfig({
        leafEvaluator: {
          type: 'rollout',
          maxSimulationDepth: 48,
          policy: 'epsilonGreedy',
          epsilon: 1.5,
        },
      }),
      (err: unknown) =>
        err instanceof RangeError && /leafEvaluator\.epsilon/.test((err as RangeError).message),
    );
  });

  it('throws RangeError for non-positive rollout maxSimulationDepth', () => {
    assert.throws(
      () => validateMctsConfig({
        leafEvaluator: {
          type: 'rollout',
          maxSimulationDepth: 0,
          policy: 'random',
        },
      }),
      (err: unknown) =>
        err instanceof RangeError && /leafEvaluator\.maxSimulationDepth/.test((err as RangeError).message),
    );
  });

  it('rollout-specific validation only fires when type === rollout', () => {
    // These should not throw — rollout fields are ignored for heuristic/auto
    assert.doesNotThrow(() => validateMctsConfig({ leafEvaluator: { type: 'heuristic' } }));
    assert.doesNotThrow(() => validateMctsConfig({ leafEvaluator: { type: 'auto' } }));
  });

  it('validates mastWarmUpThreshold as non-negative integer', () => {
    assert.doesNotThrow(() => validateMctsConfig({
      leafEvaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'mast', mastWarmUpThreshold: 0 },
    }));
    assert.throws(
      () => validateMctsConfig({
        leafEvaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'mast', mastWarmUpThreshold: -1 },
      }),
      (err: unknown) =>
        err instanceof RangeError && /leafEvaluator\.mastWarmUpThreshold/.test((err as RangeError).message),
    );
  });
});

// ---------------------------------------------------------------------------
// MCTS_PRESETS
// ---------------------------------------------------------------------------

describe('MCTS_PRESETS', () => {
  it('contains exactly fast, default, strong, and background', () => {
    assert.deepEqual(
      [...MCTS_PRESET_NAMES].sort(),
      ['background', 'default', 'fast', 'strong'],
    );
  });

  it('is frozen at the top level', () => {
    assert.ok(Object.isFrozen(MCTS_PRESETS));
  });

  it('each preset partial is frozen (immutability)', () => {
    for (const name of MCTS_PRESET_NAMES) {
      assert.ok(Object.isFrozen(MCTS_PRESETS[name]), `MCTS_PRESETS.${name} should be frozen`);
    }
  });
});

// ---------------------------------------------------------------------------
// resolvePreset
// ---------------------------------------------------------------------------

describe('resolvePreset', () => {
  it('resolvePreset("fast") returns config with iterations: 200, timeLimitMs: 2000, heuristic evaluator', () => {
    const cfg = resolvePreset('fast');
    assert.equal(cfg.iterations, 200);
    assert.equal(cfg.maxSimulationDepth, 16);
    assert.equal(cfg.timeLimitMs, 2_000);
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
  });

  it('resolvePreset("default") returns heuristic evaluator', () => {
    const cfg = resolvePreset('default');
    assert.equal(cfg.timeLimitMs, 10_000);
    assert.equal(cfg.iterations, DEFAULT_MCTS_CONFIG.iterations);
    assert.equal(cfg.explorationConstant, DEFAULT_MCTS_CONFIG.explorationConstant);
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
  });

  it('resolvePreset("strong") returns heuristic evaluator', () => {
    const cfg = resolvePreset('strong');
    assert.equal(cfg.iterations, 5000);
    assert.equal(cfg.maxSimulationDepth, 64);
    assert.equal(cfg.timeLimitMs, 30_000);
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
  });

  it('resolvePreset("background") returns background worker config', () => {
    const cfg = resolvePreset('background');
    assert.equal(cfg.iterations, 200);
    assert.equal(cfg.minIterations, 10);
    assert.deepEqual(cfg.leafEvaluator, { type: 'heuristic' });
    assert.equal(cfg.timeLimitMs, 30_000);
    assert.equal(cfg.heuristicBackupAlpha, 0.4);
    assert.equal(cfg.progressiveWideningK, 1.5);
    assert.equal(cfg.progressiveWideningAlpha, 0.5);
    assert.equal(cfg.decisionWideningCap, 8);
    assert.equal(cfg.decisionDepthMultiplier, 2);
    assert.equal(cfg.rootStopMinVisits, 5);
  });

  it('all presets pass validateMctsConfig (no invalid values)', () => {
    for (const name of MCTS_PRESET_NAMES) {
      assert.doesNotThrow(() => resolvePreset(name), `preset "${name}" should validate`);
    }
  });

  it('resolved configs are frozen/immutable', () => {
    for (const name of MCTS_PRESET_NAMES) {
      const cfg = resolvePreset(name);
      assert.ok(Object.isFrozen(cfg), `resolved "${name}" config should be frozen`);
    }
  });

  it('resolving twice returns equal but independent objects', () => {
    const a = resolvePreset('fast');
    const b = resolvePreset('fast');
    assert.deepEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
// All presets use heuristic evaluator
// ---------------------------------------------------------------------------

describe('all presets use heuristic evaluator', () => {
  it('all named presets resolve to leafEvaluator type heuristic', () => {
    for (const preset of MCTS_PRESET_NAMES) {
      const config = resolvePreset(preset);
      assert.equal(
        config.leafEvaluator?.type ?? 'heuristic',
        'heuristic',
        `preset "${preset}" should use heuristic evaluator`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// State-info cache config
// ---------------------------------------------------------------------------

describe('state-info cache config', () => {
  it('enableStateInfoCache defaults to undefined (treated as true at runtime)', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.enableStateInfoCache, undefined);
  });

  it('enableStateInfoCache can be set to true', () => {
    const cfg = validateMctsConfig({ enableStateInfoCache: true });
    assert.equal(cfg.enableStateInfoCache, true);
  });

  it('enableStateInfoCache can be set to false', () => {
    const cfg = validateMctsConfig({ enableStateInfoCache: false });
    assert.equal(cfg.enableStateInfoCache, false);
  });

  it('maxStateInfoCacheEntries defaults to undefined', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.maxStateInfoCacheEntries, undefined);
  });

  it('maxStateInfoCacheEntries accepts positive integer', () => {
    const cfg = validateMctsConfig({ maxStateInfoCacheEntries: 500 });
    assert.equal(cfg.maxStateInfoCacheEntries, 500);
  });

  it('maxStateInfoCacheEntries rejects 0', () => {
    assert.throws(
      () => validateMctsConfig({ maxStateInfoCacheEntries: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /maxStateInfoCacheEntries/.test((err as RangeError).message),
    );
  });

  it('maxStateInfoCacheEntries rejects negative', () => {
    assert.throws(
      () => validateMctsConfig({ maxStateInfoCacheEntries: -1 }),
      (err: unknown) =>
        err instanceof RangeError && /maxStateInfoCacheEntries/.test((err as RangeError).message),
    );
  });

  it('maxStateInfoCacheEntries rejects non-integer', () => {
    assert.throws(
      () => validateMctsConfig({ maxStateInfoCacheEntries: 1.5 }),
      (err: unknown) =>
        err instanceof RangeError && /maxStateInfoCacheEntries/.test((err as RangeError).message),
    );
  });
});

// ---------------------------------------------------------------------------
// Forced-sequence compression config
// ---------------------------------------------------------------------------

describe('forced-sequence compression config', () => {
  it('compressForcedSequences defaults to true', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.compressForcedSequences, true);
  });

  it('compressForcedSequences can be set to false', () => {
    const cfg = validateMctsConfig({ compressForcedSequences: false });
    assert.equal(cfg.compressForcedSequences, false);
  });

  it('compressForcedSequences can be set to true explicitly', () => {
    const cfg = validateMctsConfig({ compressForcedSequences: true });
    assert.equal(cfg.compressForcedSequences, true);
  });
});

// ---------------------------------------------------------------------------
// Confidence-based root stopping config
// ---------------------------------------------------------------------------

describe('confidence-based root stopping config', () => {
  it('rootStopConfidenceDelta defaults to 1e-3', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.rootStopConfidenceDelta, 1e-3);
  });

  it('rootStopMinVisits defaults to 16', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.rootStopMinVisits, 16);
  });

  it('rootStopConfidenceDelta accepts valid value in (0, 1)', () => {
    const cfg = validateMctsConfig({ rootStopConfidenceDelta: 0.05 });
    assert.equal(cfg.rootStopConfidenceDelta, 0.05);
  });

  it('rootStopConfidenceDelta rejects 0', () => {
    assert.throws(
      () => validateMctsConfig({ rootStopConfidenceDelta: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /rootStopConfidenceDelta/.test((err as RangeError).message),
    );
  });

  it('rootStopConfidenceDelta rejects 1', () => {
    assert.throws(
      () => validateMctsConfig({ rootStopConfidenceDelta: 1 }),
      (err: unknown) =>
        err instanceof RangeError && /rootStopConfidenceDelta/.test((err as RangeError).message),
    );
  });

  it('rootStopConfidenceDelta rejects negative', () => {
    assert.throws(
      () => validateMctsConfig({ rootStopConfidenceDelta: -0.1 }),
      (err: unknown) =>
        err instanceof RangeError && /rootStopConfidenceDelta/.test((err as RangeError).message),
    );
  });

  it('rootStopConfidenceDelta rejects > 1', () => {
    assert.throws(
      () => validateMctsConfig({ rootStopConfidenceDelta: 1.5 }),
      (err: unknown) =>
        err instanceof RangeError && /rootStopConfidenceDelta/.test((err as RangeError).message),
    );
  });

  it('rootStopMinVisits accepts positive integer', () => {
    const cfg = validateMctsConfig({ rootStopMinVisits: 32 });
    assert.equal(cfg.rootStopMinVisits, 32);
  });

  it('rootStopMinVisits rejects 0', () => {
    assert.throws(
      () => validateMctsConfig({ rootStopMinVisits: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /rootStopMinVisits/.test((err as RangeError).message),
    );
  });

  it('rootStopMinVisits rejects negative', () => {
    assert.throws(
      () => validateMctsConfig({ rootStopMinVisits: -1 }),
      (err: unknown) =>
        err instanceof RangeError && /rootStopMinVisits/.test((err as RangeError).message),
    );
  });

  it('rootStopMinVisits rejects non-integer', () => {
    assert.throws(
      () => validateMctsConfig({ rootStopMinVisits: 1.5 }),
      (err: unknown) =>
        err instanceof RangeError && /rootStopMinVisits/.test((err as RangeError).message),
    );
  });
});

// ---------------------------------------------------------------------------
// Heuristic backup alpha config
// ---------------------------------------------------------------------------

describe('heuristic backup alpha config', () => {
  it('heuristicBackupAlpha defaults to undefined (treated as 0 at runtime)', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.heuristicBackupAlpha, undefined);
  });

  it('heuristicBackupAlpha accepts 0', () => {
    const cfg = validateMctsConfig({ heuristicBackupAlpha: 0 });
    assert.equal(cfg.heuristicBackupAlpha, 0);
  });

  it('heuristicBackupAlpha accepts 1', () => {
    const cfg = validateMctsConfig({ heuristicBackupAlpha: 1 });
    assert.equal(cfg.heuristicBackupAlpha, 1);
  });

  it('heuristicBackupAlpha accepts value in (0, 1)', () => {
    const cfg = validateMctsConfig({ heuristicBackupAlpha: 0.3 });
    assert.equal(cfg.heuristicBackupAlpha, 0.3);
  });

  it('heuristicBackupAlpha rejects negative', () => {
    assert.throws(
      () => validateMctsConfig({ heuristicBackupAlpha: -0.1 }),
      (err: unknown) =>
        err instanceof RangeError && /heuristicBackupAlpha/.test((err as RangeError).message),
    );
  });

  it('heuristicBackupAlpha rejects > 1', () => {
    assert.throws(
      () => validateMctsConfig({ heuristicBackupAlpha: 1.5 }),
      (err: unknown) =>
        err instanceof RangeError && /heuristicBackupAlpha/.test((err as RangeError).message),
    );
  });

  it('only "background" preset enables heuristicBackupAlpha > 0', () => {
    for (const name of MCTS_PRESET_NAMES) {
      const cfg = resolvePreset(name);
      const alpha = cfg.heuristicBackupAlpha ?? 0;
      if (name === 'background') {
        assert.equal(alpha, 0.4, 'background preset should have heuristicBackupAlpha 0.4');
      } else {
        assert.equal(alpha, 0, `preset "${name}" should not enable heuristicBackupAlpha`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Decision config fields (62MCTSSEAVIS-002)
// ---------------------------------------------------------------------------

describe('decisionWideningCap config', () => {
  it('defaults to 12 when not provided', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.decisionWideningCap, 12);
  });

  it('accepts a valid positive integer', () => {
    const cfg = validateMctsConfig({ decisionWideningCap: 20 });
    assert.equal(cfg.decisionWideningCap, 20);
  });

  it('rejects 0', () => {
    assert.throws(
      () => validateMctsConfig({ decisionWideningCap: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /decisionWideningCap/.test((err as RangeError).message),
    );
  });

  it('rejects negative values', () => {
    assert.throws(
      () => validateMctsConfig({ decisionWideningCap: -1 }),
      (err: unknown) =>
        err instanceof RangeError && /decisionWideningCap/.test((err as RangeError).message),
    );
  });

  it('rejects non-integer', () => {
    assert.throws(
      () => validateMctsConfig({ decisionWideningCap: 5.5 }),
      (err: unknown) =>
        err instanceof RangeError && /decisionWideningCap/.test((err as RangeError).message),
    );
  });
});

describe('decisionDepthMultiplier config', () => {
  it('defaults to 4 when not provided', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.decisionDepthMultiplier, 4);
  });

  it('accepts a valid positive integer', () => {
    const cfg = validateMctsConfig({ decisionDepthMultiplier: 8 });
    assert.equal(cfg.decisionDepthMultiplier, 8);
  });

  it('accepts 1 (minimum)', () => {
    const cfg = validateMctsConfig({ decisionDepthMultiplier: 1 });
    assert.equal(cfg.decisionDepthMultiplier, 1);
  });

  it('rejects 0', () => {
    assert.throws(
      () => validateMctsConfig({ decisionDepthMultiplier: 0 }),
      (err: unknown) =>
        err instanceof RangeError && /decisionDepthMultiplier/.test((err as RangeError).message),
    );
  });

  it('rejects negative values', () => {
    assert.throws(
      () => validateMctsConfig({ decisionDepthMultiplier: -1 }),
      (err: unknown) =>
        err instanceof RangeError && /decisionDepthMultiplier/.test((err as RangeError).message),
    );
  });

  it('rejects non-integer', () => {
    assert.throws(
      () => validateMctsConfig({ decisionDepthMultiplier: 2.5 }),
      (err: unknown) =>
        err instanceof RangeError && /decisionDepthMultiplier/.test((err as RangeError).message),
    );
  });
});

describe('visitor config', () => {
  it('defaults to undefined when not provided', () => {
    const cfg = validateMctsConfig({});
    assert.equal(cfg.visitor, undefined);
  });

  it('accepts a visitor with onEvent callback', () => {
    const visitor: MctsSearchVisitor = { onEvent: () => {} };
    const cfg = validateMctsConfig({ visitor });
    assert.equal(cfg.visitor, visitor);
  });

  it('accepts a visitor with no onEvent (empty object)', () => {
    const visitor: MctsSearchVisitor = {};
    const cfg = validateMctsConfig({ visitor });
    assert.equal(cfg.visitor, visitor);
  });

  it('frozen config still allows visitor callback reference', () => {
    const calls: string[] = [];
    const visitor: MctsSearchVisitor = { onEvent: () => { calls.push('called'); } };
    const cfg = validateMctsConfig({ visitor });
    assert.ok(Object.isFrozen(cfg));
    // The visitor reference is accessible and the callback is callable
    cfg.visitor!.onEvent!({ type: 'poolExhausted', capacity: 100, iteration: 50 });
    assert.deepEqual(calls, ['called']);
  });
});

describe('decision fields in presets', () => {
  it('all presets include decisionWideningCap and decisionDepthMultiplier after resolve', () => {
    for (const name of MCTS_PRESET_NAMES) {
      const cfg = resolvePreset(name);
      assert.equal(typeof cfg.decisionWideningCap, 'number', `preset "${name}" should have decisionWideningCap`);
      assert.equal(typeof cfg.decisionDepthMultiplier, 'number', `preset "${name}" should have decisionDepthMultiplier`);
    }
  });

  it('visitor is NOT included in presets', () => {
    for (const name of MCTS_PRESET_NAMES) {
      const preset = MCTS_PRESETS[name];
      assert.equal(
        (preset as Record<string, unknown>)['visitor'],
        undefined,
        `preset "${name}" should not include visitor`,
      );
    }
  });
});
