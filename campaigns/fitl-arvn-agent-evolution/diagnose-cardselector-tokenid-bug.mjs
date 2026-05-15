#!/usr/bin/env node
/**
 * DEFINITIVE PROOF: the `topNVisible` schedule resolver's `matchesCardSelector`
 * compares `token.id` (the token INSTANCE id, e.g. `tok___eventCard_243`)
 * against the event-deck card-definition ids (e.g. `card-125`). Real FITL card
 * tokens carry the card identity in `token.props.cardId`, not `token.id`, so the
 * tag/`cardIds` lookup NEVER matches and `schedule.distance.toBoundary.coupEntry.cards`
 * can NEVER resolve `ready` in a real game — it always returns `partial.lowerBound`.
 *
 * This script:
 *   1. compiles the real FITL GameDef,
 *   2. takes a real initial state and extracts a REAL coup card token from the
 *      shuffled deck (one with `props.isCoup === true`),
 *   3. places that real coup token at the top of `lookahead:none`,
 *   4. calls the production resolver and shows it returns `partial.lowerBound: 2`,
 *   5. shows the corrected lookup (`token.props.cardId`) WOULD match → `ready: 1`.
 *
 * Usage: node diagnose-cardselector-tokenid-bug.mjs
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = (() => {
  let cur = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur;
    cur = join(cur, '..');
  }
  return process.cwd();
})();

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));
const {
  assertValidatedGameDef,
  initialState,
  createGameDefRuntime,
  computeFullHash,
  createZobristTable,
  asPlayerId,
  asBoundaryId,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { createPolicyRuntimeProviders } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/policy-runtime.js'));

const def = assertValidatedGameDef(
  runGameSpecStagesFromBundle(
    loadGameSpecBundleFromEntrypoint(join(REPO_ROOT, 'data/games/fire-in-the-lake.game-spec.md')),
  ).compilation.result.gameDef,
);

// Card-DEFINITION ids tagged `coup`.
const coupCardDefIds = new Set(
  (def.eventDecks ?? []).flatMap((d) => d.cards).filter((c) => c.tags?.includes('coup')).map((c) => c.id),
);
console.log('coup card-DEFINITION ids:', [...coupCardDefIds].join(', '));

// Real initial state: pull a real coup TOKEN and a real non-coup TOKEN out of the deck.
const base = initialState(def, 1000, 4).state;
const deck = base.zones['deck:none'] ?? [];
const realCoupToken = deck.find((t) => t.props?.isCoup === true);
const realNonCoupToken = deck.find((t) => t.props?.isCoup !== true);
if (!realCoupToken || !realNonCoupToken) {
  console.error('Could not find real coup/non-coup tokens in the deck');
  process.exit(1);
}
console.log('\nreal COUP token from deck   :', JSON.stringify(realCoupToken));
console.log('real NON-COUP token from deck:', JSON.stringify(realNonCoupToken));
console.log(
  `\n--> token.id = "${realCoupToken.id}"  but card-def id is "${realCoupToken.props.cardId}"  ` +
    `(mismatch: token.id is NOT a card-def id)`,
);

// Build a state with the real coup token visible at the top of lookahead:none,
// a real non-coup token in played:none (mirrors a real mid-game lifecycle state).
const next = {
  ...base,
  zones: {
    ...base.zones,
    'played:none': [realNonCoupToken],
    'lookahead:none': [realCoupToken],
    'leader:none': [],
  },
};
const hash = computeFullHash(createZobristTable(def), next);
const state = { ...next, stateHash: hash, _runningHash: hash };

const providers = createPolicyRuntimeProviders({
  def,
  state,
  playerId: asPlayerId(1),
  seatId: 'arvn',
  trustedMoveIndex: new Map(),
  catalog: def.agents,
  runtime: createGameDefRuntime(def),
  runtimeError: (code, message) => new Error(`${code}: ${message}`),
});

const REF = {
  kind: 'scheduleDistance',
  target: { kind: 'boundary', boundaryId: asBoundaryId('coupEntry') },
  unit: 'cards',
};
const resolution = providers.phaseSchedule.resolveScheduleDistance(REF, state);

console.log('\n=== PRODUCTION RESOLVER OUTPUT (real coup token in lookahead:none) ===');
console.log(JSON.stringify(resolution, null, 1));

const isReady1 = resolution.kind === 'ready' && resolution.value === 1;
console.log(
  isReady1
    ? '\nRESULT: ready:1 — resolver works correctly.'
    : `\nRESULT: ${resolution.kind}${resolution.kind === 'partial' ? `.lowerBound=${resolution.lowerBound}` : ''} ` +
        `— BUG: a real coup token IS the top of lookahead:none, the resolver SHOULD return ready:1.`,
);

// Show the corrected matchesCardSelector logic would match.
const buggyMatch = (token) => {
  const tokenId = String(token.id);
  const card = (def.eventDecks ?? []).flatMap((d) => d.cards).find((e) => e.id === tokenId);
  return ['coup'].some((tag) => card?.tags?.includes(tag) === true);
};
const correctedMatch = (token) => {
  const cardDefId = typeof token.props?.cardId === 'string' ? token.props.cardId : String(token.id);
  const card = (def.eventDecks ?? []).flatMap((d) => d.cards).find((e) => e.id === cardDefId);
  return ['coup'].some((tag) => card?.tags?.includes(tag) === true);
};
console.log('\n=== matchesCardSelector logic comparison on the real coup token ===');
console.log(`  CURRENT  (uses String(token.id)="${realCoupToken.id}")           => ${buggyMatch(realCoupToken)}`);
console.log(`  CORRECTED(uses token.props.cardId="${realCoupToken.props.cardId}") => ${correctedMatch(realCoupToken)}`);
console.log(`  CORRECTED on real non-coup token ("${realNonCoupToken.props.cardId}") => ${correctedMatch(realNonCoupToken)}`);
