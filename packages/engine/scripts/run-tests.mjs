import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { listE2eTestsForLane, listIntegrationTestsForLane, toDistTestPath } from './test-lane-manifest.mjs';

const lanePatterns = {
  default: ['dist/test/unit/**/*.test.js', ...listIntegrationTestsForLane('integration:core').map(toDistTestPath)],
  e2e: listE2eTestsForLane('e2e').map(toDistTestPath),
  'e2e:slow': listE2eTestsForLane('e2e:slow').map(toDistTestPath),
  'e2e:mcts': listE2eTestsForLane('e2e:mcts').map(toDistTestPath),
  'e2e:mcts:interactive': listE2eTestsForLane('e2e:mcts:interactive').map(toDistTestPath),
  'e2e:mcts:turn': listE2eTestsForLane('e2e:mcts:turn').map(toDistTestPath),
  'e2e:mcts:background': listE2eTestsForLane('e2e:mcts:background').map(toDistTestPath),
  'e2e:mcts:fitl': listE2eTestsForLane('e2e:mcts:fitl').map(toDistTestPath),
  'e2e:mcts:fitl:interactive': listE2eTestsForLane('e2e:mcts:fitl:interactive').map(toDistTestPath),
  'e2e:mcts:fitl:turn': listE2eTestsForLane('e2e:mcts:fitl:turn').map(toDistTestPath),
  'e2e:mcts:fitl:background': listE2eTestsForLane('e2e:mcts:fitl:background').map(toDistTestPath),
  'e2e:mcts:fitl:competence': listE2eTestsForLane('e2e:mcts:fitl:competence').map(toDistTestPath),
  'e2e:all': listE2eTestsForLane('e2e:all').map(toDistTestPath),
  integration: listIntegrationTestsForLane('integration').map(toDistTestPath),
  'integration:core': listIntegrationTestsForLane('integration:core').map(toDistTestPath),
  'integration:game-packages': listIntegrationTestsForLane('integration:game-packages').map(toDistTestPath),
  'integration:fitl-events': listIntegrationTestsForLane('integration:fitl-events').map(toDistTestPath),
  'integration:fitl-rules': listIntegrationTestsForLane('integration:fitl-rules').map(toDistTestPath),
  'integration:texas-cross-game': listIntegrationTestsForLane('integration:texas-cross-game').map(toDistTestPath),
};

const normalizeRequestedPattern = (pattern) => {
  if (pattern === '--') {
    return null;
  }

  if (pattern.endsWith('.test.ts')) {
    const jsFileName = basename(pattern).replace(/\.ts$/, '.js');
    return `dist/test/**/${jsFileName}`;
  }

  if (pattern.startsWith('test/') && pattern.endsWith('.test.js')) {
    return `dist/${pattern}`;
  }

  return pattern;
};

function parseArgs(argv) {
  let lane = 'default';
  const rawPatterns = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lane') {
      lane = argv[index + 1] ?? lane;
      index += 1;
      continue;
    }
    if (arg.startsWith('--lane=')) {
      lane = arg.slice('--lane='.length);
      continue;
    }
    rawPatterns.push(arg);
  }

  return { lane, rawPatterns };
}

const { lane, rawPatterns } = parseArgs(process.argv.slice(2));
const requestedPatterns = rawPatterns
  .map(normalizeRequestedPattern)
  .filter((pattern) => pattern !== null);
const patterns = requestedPatterns.length > 0 ? requestedPatterns : lanePatterns[lane];

if (!patterns) {
  throw new Error(`Unknown test lane: ${lane}`);
}

const result = spawnSync('node', ['--test', ...patterns], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
