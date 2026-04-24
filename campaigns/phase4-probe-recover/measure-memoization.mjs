import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const FITL_ENTRYPOINT = resolve(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
const DEFAULT_SEEDS = [
  1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008,
  1009, 1010, 1011, 1012, 1013, 1014, 1020, 1049, 1054,
];
const VARIANT_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'];

const parsePositiveInteger = (value, flag) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive safe integer`);
  }
  return parsed;
};

const parseArgs = (argv) => {
  const options = {
    maxTurns: 500,
    seeds: DEFAULT_SEEDS,
    modes: ['enabled', 'disabled'],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--max-turns') {
      if (next === undefined) {
        throw new Error('--max-turns requires a value');
      }
      options.maxTurns = parsePositiveInteger(next, '--max-turns');
      index += 1;
      continue;
    }
    if (arg === '--seed-list') {
      if (next === undefined) {
        throw new Error('--seed-list requires a value');
      }
      options.seeds = next
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => parsePositiveInteger(entry, '--seed-list'));
      index += 1;
      continue;
    }
    if (arg === '--modes') {
      if (next === undefined) {
        throw new Error('--modes requires a value');
      }
      options.modes = next.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      for (const mode of options.modes) {
        if (mode !== 'enabled' && mode !== 'disabled') {
          throw new Error(`unsupported mode: ${mode}`);
        }
      }
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return options;
};

const [
  { PolicyAgent },
  { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle },
  { assertValidatedGameDef, createGameDefRuntime },
  { runGame },
  { LruCache },
] = await Promise.all([
  import('../../packages/engine/dist/src/agents/index.js'),
  import('../../packages/engine/dist/src/cnl/index.js'),
  import('../../packages/engine/dist/src/kernel/index.js'),
  import('../../packages/engine/dist/src/sim/index.js'),
  import('../../packages/engine/dist/src/shared/lru-cache.js'),
]);

const options = parseArgs(process.argv.slice(2));
const originalGet = LruCache.prototype.get;
const originalSet = LruCache.prototype.set;

const compileFitl = () => {
  const bundle = loadGameSpecBundleFromEntrypoint(FITL_ENTRYPOINT);
  const staged = runGameSpecStagesFromBundle(bundle);
  const diagnostics = [
    ...staged.parsed.diagnostics,
    ...staged.validation.diagnostics,
    ...(staged.compilation.result?.diagnostics ?? []),
  ];
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0 || staged.compilation.result?.gameDef == null) {
    throw new Error(`FITL compile failed: ${errors.map((diagnostic) => diagnostic.message).join('; ')}`);
  }
  return assertValidatedGameDef(staged.compilation.result.gameDef);
};

const createAgents = () =>
  VARIANT_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));

const withCacheMode = (mode, counters, callback) => {
  LruCache.prototype.get = function get(key) {
    counters.gets += 1;
    const value = originalGet.call(this, key);
    if (value !== undefined) {
      counters.hits += 1;
    }
    return value;
  };
  LruCache.prototype.set = function set(key, value) {
    counters.sets += 1;
    if (mode === 'enabled') {
      originalSet.call(this, key, value);
      counters.peakSize = Math.max(counters.peakSize, this.size);
    }
  };
  try {
    return callback();
  } finally {
    LruCache.prototype.get = originalGet;
    LruCache.prototype.set = originalSet;
  }
};

const def = compileFitl();
const report = {
  command: process.argv.join(' '),
  maxTurns: options.maxTurns,
  seeds: options.seeds,
  profiles: VARIANT_PROFILES,
  modes: [],
};

for (const mode of options.modes) {
  const counters = { gets: 0, hits: 0, sets: 0, peakSize: 0 };
  const seedRows = [];
  const modeStarted = performance.now();
  withCacheMode(mode, counters, () => {
    for (const seed of options.seeds) {
      const runtime = createGameDefRuntime(def);
      const before = { ...counters };
      const seedStarted = performance.now();
      const trace = runGame(def, seed, createAgents(), options.maxTurns, def.seats.length, { skipDeltas: true }, runtime);
      seedRows.push({
        seed,
        wallMs: Math.round(performance.now() - seedStarted),
        stopReason: trace.stopReason,
        turns: trace.turnsCount,
        decisions: trace.decisions.length,
        cacheGets: counters.gets - before.gets,
        cacheHits: counters.hits - before.hits,
        cacheSets: counters.sets - before.sets,
        hitRate: counters.gets === before.gets ? 0 : (counters.hits - before.hits) / (counters.gets - before.gets),
        peakCacheSize: counters.peakSize,
      });
    }
  });
  report.modes.push({
    mode,
    wallMs: Math.round(performance.now() - modeStarted),
    cacheGets: counters.gets,
    cacheHits: counters.hits,
    cacheSets: counters.sets,
    hitRate: counters.gets === 0 ? 0 : counters.hits / counters.gets,
    peakCacheSize: counters.peakSize,
    seeds: seedRows,
  });
}

console.log(JSON.stringify(report, null, 2));
