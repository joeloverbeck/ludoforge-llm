#!/usr/bin/env node
/**
 * Aggregate ARVN (evolved-seat) action usage + schedule-ref signal across a
 * traces/ directory produced by `run-tournament.mjs --trace-default all`.
 *
 * Usage: node diagnose-action-distribution.mjs [tracesDir]
 *   tracesDir defaults to ./traces relative to this script.
 *
 * Reports, across all trace-*.json:
 *   - main-phase action-selection distribution (govern/train/event/patrol/...),
 *     excluding coup-phase forced decisions (actionId starts with "coup") and
 *     excluding microturn kinds (chooseNStep/chooseOne)
 *   - coup-phase forced-decision distribution (separate bucket)
 *   - microturn-kind distribution
 *   - scheduleFallbackFired distribution (kind:value:reason) — the spec-170/171
 *     observer-policy witness; "ready:N" means a coup card was visible at
 *     distance N, "useLowerBound:N" / partial means the visible sequence was
 *     exhausted without a match.
 *   - per-seed main-phase action counts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const tracesDir = process.argv[2] ? process.argv[2] : join(HERE, 'traces');

const files = readdirSync(tracesDir)
  .filter((f) => f.startsWith('trace-') && f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  process.stderr.write(`No trace-*.json files in ${tracesDir}\n`);
  process.exit(1);
}

const isCoup = (actionId) => String(actionId).toLowerCase().startsWith('coup');

const mainPhase = {};
const coupPhase = {};
const microturn = {};
const scheduleFallback = {};
const perSeedMain = {};
let totalEvolvedMoves = 0;

for (const f of files) {
  const t = JSON.parse(readFileSync(join(tracesDir, f), 'utf8'));
  const seed = t.seed;
  perSeedMain[seed] = {};
  for (const m of t.evolvedMoves ?? []) {
    totalEvolvedMoves += 1;
    if (m.decisionKind === 'actionSelection') {
      if (isCoup(m.actionId)) {
        coupPhase[m.actionId] = (coupPhase[m.actionId] ?? 0) + 1;
      } else {
        mainPhase[m.actionId] = (mainPhase[m.actionId] ?? 0) + 1;
        perSeedMain[seed][m.actionId] = (perSeedMain[seed][m.actionId] ?? 0) + 1;
      }
    } else {
      microturn[m.decisionKind] = (microturn[m.decisionKind] ?? 0) + 1;
    }
    for (const c of m.agentDecision?.candidates ?? []) {
      const sf = c.scheduleFallbackFired;
      if (sf) {
        const k = `${sf.kind}:${sf.value}:${sf.reason ?? ''}`;
        scheduleFallback[k] = (scheduleFallback[k] ?? 0) + 1;
      }
    }
  }
}

const sortDesc = (obj) =>
  Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]));

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

console.log(`traces: ${files.length}  totalEvolvedMoves: ${totalEvolvedMoves}`);
console.log(`\n=== MAIN-PHASE action-selection (${sum(mainPhase)} decisions) ===`);
console.log(JSON.stringify(sortDesc(mainPhase), null, 1));
console.log(`\n=== COUP-PHASE forced decisions (${sum(coupPhase)} decisions) ===`);
console.log(JSON.stringify(sortDesc(coupPhase), null, 1));
console.log(`\n=== MICROTURN kinds (${sum(microturn)} decisions) ===`);
console.log(JSON.stringify(sortDesc(microturn), null, 1));
console.log(`\n=== scheduleFallbackFired (kind:value:reason) ===`);
console.log(
  Object.keys(scheduleFallback).length === 0
    ? '(none — no schedule-reading consideration active)'
    : JSON.stringify(sortDesc(scheduleFallback), null, 1),
);
console.log(`\n=== per-seed MAIN-PHASE counts ===`);
for (const seed of Object.keys(perSeedMain).sort()) {
  console.log(`  seed ${seed}: ${JSON.stringify(sortDesc(perSeedMain[seed]))}`);
}
