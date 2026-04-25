import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../../../dist/src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  initialState,
  serializeGameState,
} from '../../../../dist/src/kernel/index.js';
import { runGame } from '../../../../dist/src/sim/index.js';
import { compileProductionSpec } from '../../../../dist/test/helpers/production-spec-helpers.js';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const SEED = 1001;
const PLAYER_COUNT = 4;
const MAX_TURNS = 500;
const VARIANT_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'];

const writeJson = (name, value) => {
  writeFileSync(join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
};

const { compiled } = compileProductionSpec();
const def = assertValidatedGameDef(compiled.gameDef);
const agents = VARIANT_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
const runtime = createGameDefRuntime(def);
const trace = runGame(def, SEED, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);
const initial = initialState(def, SEED, PLAYER_COUNT, undefined, createGameDefRuntime(def)).state;
const gameDefHash = createHash('sha256').update(JSON.stringify(def)).digest('hex');
const firstRecovery = trace.probeHoleRecoveries[0];
const decisionSequence = firstRecovery === undefined
  ? trace.decisions.map((entry) => entry.decision)
  : trace.decisions
    .slice(0, trace.decisions.findIndex((entry) => entry.stateHash === firstRecovery.stateHashBefore) + 1)
    .map((entry) => entry.decision);

writeFileSync(join(OUT_DIR, 'game-def-hash.txt'), `${gameDefHash}\n`);
writeJson('initial-state.json', serializeGameState(initial));
writeJson('decision-sequence.json', decisionSequence);
writeFileSync(
  join(OUT_DIR, 'README.md'),
  [
    '# Seed 1001 NVA March Dead-End Fixture',
    '',
    'Spec 144 regression fixture for the Fire in the Lake ARVN-evolved campaign witness.',
    'The decision sequence records the deterministic prefix up to the historical NVA march probe hole on seed 1001.',
    'The post-fix engine reaches `stopReason=terminal`; the recovery safety net records the residual probe hole instead of terminating as `noLegalMoves`.',
    '',
    'Regenerate after intentional GameDef changes with:',
    '',
    '```bash',
    'pnpm -F @ludoforge/engine build',
    'node packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/regenerate.mjs',
    '```',
    '',
  ].join('\n'),
);
