#!/usr/bin/env node
/**
 * Directive-#1 verification: does a Coup card EVER sit in `lookahead:none`
 * during ANY agent decision, across full FITL tournament games?
 *
 * Spec 171 fixed the `visiblePrefix` starvation bug — the resolver now composes
 * `[played:none top, lookahead:none top]`. But DIAGNOSE run B observed
 * 2467/2467 `partial.lowerBound=2` for the ARVN probe consideration: zero
 * `ready` resolutions. This script wraps ALL 4 agents and, at every decision,
 * inspects the live `played:none` / `lookahead:none` zone contents to determine
 * whether the coup-in-lookahead state is ever reachable in real games and, if
 * so, which seats observe it.
 *
 * Usage: node diagnose-coup-lookahead.mjs [--seeds N] [--max-turns N]
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

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const SEED_COUNT = Number(getArg('seeds', '3'));
const MAX_TURNS = Number(getArg('max-turns', '200'));
const PLAYER_COUNT = 4;
const EVOLVED_SEAT = 'arvn';

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));
const { assertValidatedGameDef, createGameDefRuntime, forkGameDefRuntimeForRun } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));
const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));

const bundle = loadGameSpecBundleFromEntrypoint(
  join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md'),
);
const staged = runGameSpecStagesFromBundle(bundle);
if (staged.validation.blocked || staged.compilation.blocked) {
  console.error('Compilation/validation blocked');
  process.exit(1);
}
const def = assertValidatedGameDef(staged.compilation.result.gameDef);
const runtime = createGameDefRuntime(def);

const coupCardIds = new Set(
  (def.eventDecks ?? [])
    .flatMap((d) => d.cards)
    .filter((c) => c.tags?.includes('coup'))
    .map((c) => c.id),
);
const seats = def.seats ?? [];
const seatProfiles = seats.map((s) => {
  const id = s.id.toLowerCase();
  return id === EVOLVED_SEAT ? `${id}-evolved` : `${id}-baseline`;
});

const topId = (zone) => {
  if (!zone || zone.length === 0) return null;
  const t = zone[0];
  return String(t.id);
};
const isCoupId = (id) => id !== null && coupCardIds.has(id);

// Per-run accumulators
function freshStats() {
  return {
    decisions: 0,
    bySeat: {}, // seatId -> { decisions, lookaheadCoup, playedCoup, actionSelection, actionSelLookaheadCoup }
    lookaheadCoupDistinctCards: new Set(),
    everCoupInLookahead: false,
    everCoupInPlayed: false,
    lookaheadCardSeen: new Set(),
  };
}

class ProbeAgent {
  constructor(config, seatId, stats) {
    this.inner = new PolicyAgent(config);
    this.seatId = seatId;
    this.stats = stats;
  }
  chooseDecision(input) {
    const s = this.stats;
    const state = input.state;
    const lookahead = state?.zones?.['lookahead:none'];
    const played = state?.zones?.['played:none'];
    const laTop = topId(lookahead);
    const plTop = topId(played);
    const laCoup = isCoupId(laTop);
    const plCoup = isCoupId(plTop);
    // decisionKind: actionSelection vs microturn (chooseOne/chooseNStep)
    const decisionKind = input.microturn?.kind ?? 'unknown';
    s.decisions += 1;
    if (laTop !== null) s.lookaheadCardSeen.add(laTop);
    if (laCoup) {
      s.everCoupInLookahead = true;
      s.lookaheadCoupDistinctCards.add(laTop);
    }
    if (plCoup) s.everCoupInPlayed = true;
    const bs = (s.bySeat[this.seatId] ??= {
      decisions: 0,
      lookaheadCoup: 0,
      playedCoup: 0,
      actionSelection: 0,
      actionSelLookaheadCoup: 0,
    });
    bs.decisions += 1;
    if (laCoup) bs.lookaheadCoup += 1;
    if (plCoup) bs.playedCoup += 1;
    if (decisionKind === 'actionSelection') {
      bs.actionSelection += 1;
      if (laCoup) bs.actionSelLookaheadCoup += 1;
    }
    return this.inner.chooseDecision(input);
  }
}

console.error(
  `coup card ids: ${[...coupCardIds].join(', ')}  |  seats: ${seats.map((x) => x.id).join(',')}`,
);

const overall = {
  totalDecisions: 0,
  totalLookaheadCoup: 0,
  seedsWithCoupInLookahead: 0,
  perSeat: {},
};

for (let i = 0; i < SEED_COUNT; i += 1) {
  const seed = 1000 + i;
  const stats = freshStats();
  const agents = seats.map(
    (s, idx) =>
      new ProbeAgent(
        { profileId: seatProfiles[idx], traceLevel: 'summary' },
        s.id.toLowerCase(),
        stats,
      ),
  );
  let stopReason = 'unknown';
  try {
    const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, undefined, forkGameDefRuntimeForRun(runtime));
    stopReason = trace.stopReason;
  } catch (e) {
    console.error(`seed ${seed} ERROR: ${e.message}`);
  }
  const laCoupTotal = Object.values(stats.bySeat).reduce((a, b) => a + b.lookaheadCoup, 0);
  overall.totalDecisions += stats.decisions;
  overall.totalLookaheadCoup += laCoupTotal;
  if (stats.everCoupInLookahead) overall.seedsWithCoupInLookahead += 1;
  for (const [seat, bs] of Object.entries(stats.bySeat)) {
    const o = (overall.perSeat[seat] ??= {
      decisions: 0,
      lookaheadCoup: 0,
      playedCoup: 0,
      actionSelection: 0,
      actionSelLookaheadCoup: 0,
    });
    o.decisions += bs.decisions;
    o.lookaheadCoup += bs.lookaheadCoup;
    o.playedCoup += bs.playedCoup;
    o.actionSelection += bs.actionSelection;
    o.actionSelLookaheadCoup += bs.actionSelLookaheadCoup;
  }
  console.error(
    `seed ${seed}: stop=${stopReason} decisions=${stats.decisions} ` +
      `everCoupInLookahead=${stats.everCoupInLookahead} (distinct coup cards seen in LA: ${[...stats.lookaheadCoupDistinctCards].join(',') || 'none'}) ` +
      `everCoupInPlayed=${stats.everCoupInPlayed} distinctLookaheadCards=${stats.lookaheadCardSeen.size} ` +
      `lookaheadCoupDecisions=${laCoupTotal}`,
  );
  for (const [seat, bs] of Object.entries(stats.bySeat)) {
    console.error(
      `   ${seat}: decisions=${bs.decisions} actionSel=${bs.actionSelection} ` +
        `lookaheadCoup=${bs.lookaheadCoup} actionSelLookaheadCoup=${bs.actionSelLookaheadCoup} playedCoup=${bs.playedCoup}`,
    );
  }
}

console.error('\n=== OVERALL ===');
console.error(
  `seeds=${SEED_COUNT} totalDecisions=${overall.totalDecisions} ` +
    `seedsWithCoupInLookahead=${overall.seedsWithCoupInLookahead}/${SEED_COUNT} ` +
    `totalLookaheadCoupDecisions=${overall.totalLookaheadCoup}`,
);
for (const [seat, o] of Object.entries(overall.perSeat)) {
  console.error(
    `  ${seat}: decisions=${o.decisions} actionSel=${o.actionSelection} ` +
      `lookaheadCoup=${o.lookaheadCoup} actionSelLookaheadCoup=${o.actionSelLookaheadCoup} playedCoup=${o.playedCoup}`,
  );
}
process.stdout.write(JSON.stringify(overall, (_k, v) => (v instanceof Set ? [...v] : v), 2) + '\n');
