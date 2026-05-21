# 188FITLFOUFAC-009: NVA skeleton + headline witnesses (port of 008)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `archive/tickets/188FITLFOUFAC-008.md`

## Problem

Spec 188 §4.2 / Phase 2 authors the NVA faction personality as a correct skeleton: doctrine set + signature plan templates (Rally+Infiltrate, March+Infiltrate, March+Ambush, Attack+Ambush, Terror→Rally, LoC-occupation) + key role selectors + top errors-to-avoid guardrails + relationship wiring (NVA/VC rival-ally per report §5.2). This is a **port** of the US skeleton ticket (008): it follows the same authoring shape, listing only NVA-specific content.

## Assumption Reassessment (2026-05-21)

1. `nva-baseline` is the current NVA profile binding (`92-agents.md` ~line 756); this ticket authors the NVA skeleton and rebinds the NVA seat.
2. The skeleton-authoring structure (how doctrines/templates/selectors/guardrails/relationships lay out in `92-agents.md`) is established by ticket 008 — follow it verbatim, substituting NVA content.
3. The NVA/VC relationship (report §5.2) is the counterpart of VC's wiring in ticket 010.

## Architecture Check

1. Port pattern — references ticket 008's structure; only NVA-specific doctrines/combos/selectors/guardrails/relationship differ.
2. Pure YAML, generic constructs (Foundation #1, #2).
3. No backwards-compatibility shims.

## What to Change

### 1. NVA skeleton (follow ticket 008's shape)

Author NVA doctrine carriers (priority stack report ~line 687; final statement ~line 871), signature templates (combos ~lines 731-808), key selectors (target features ~line 810), top guardrails (errors ~line 859), and the NVA/VC relationship (report §5.2, ~line 1172). Rebind the NVA seat.

### 2. Headline witnesses

Add Phase-2 NVA headline witnesses: March+Infiltrate when VC base stealable and VC near win; protects Trail before Coup.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/policy-profile-quality/nva-march-infiltrate-steal-vc-base.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-protects-trail-before-coup.test.ts` (new)

(Witness paths follow the `policy-profile-quality/` convention; may be consolidated.)

## Out of Scope

- ARVN (003–007), US (008), VC (010).
- Full NVA fidelity beyond the skeleton.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the NVA skeleton bound to the NVA seat (no diagnostics).
2. The two NVA headline witnesses pass.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Determinism preserved — byte-identical compile on repeat (Foundation #16).
2. No engine/compiler diff (Foundation #1).
3. NVA headline witnesses are warning-class (live in `policy-profile-quality/`).

## Test Plan

### New/Modified Tests

1. `nva-march-infiltrate-steal-vc-base.test.ts`, `nva-protects-trail-before-coup.test.ts` — Phase-2 NVA headline witnesses.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/nva-march-infiltrate-steal-vc-base.test.js packages/engine/dist/test/policy-profile-quality/nva-protects-trail-before-coup.test.js`
2. `pnpm turbo test`

## Outcome

Completed on 2026-05-22.

What changed:
- Authored the NVA Phase-2 skeleton in `data/games/fire-in-the-lake/92-agents.md`: NVA strategic conditions, role selectors, six signature plan templates, NVA/VC relationship wiring from the NVA side, posture hook, strategy modules, guardrails, and the `nva-baseline` profile binding.
- Added two warning-class NVA policy-profile-quality witnesses plus `nva-plan-witness-helpers.ts`, mirroring the completed US skeleton pattern from `archive/tickets/188FITLFOUFAC-008.md`.
- Refreshed the Spec 178 ARVN continued-deepening outcome parity fixtures after the NVA profile rebinding intentionally shifted full-game trajectories for the non-ARVN seats before later ARVN decisions.
- No engine/compiler production source or schema files changed.

Command ledger:
- `pnpm -F @ludoforge/engine build` — passed after the NVA YAML/test additions.
- `node --test packages/engine/dist/test/policy-profile-quality/nva-march-infiltrate-steal-vc-base.test.js packages/engine/dist/test/policy-profile-quality/nva-protects-trail-before-coup.test.js` — passed, 2 tests / 2 suites.
- `node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` — initially failed on stale fixtures after the intentional NVA trajectory shift; passed after refreshing the five fixture files.
- `pnpm -F @ludoforge/engine test:all` — initially failed only on stale `policy-preview-inner-outcome-parity.test.js`; passed after fixture refresh, 958 tests.

Command substitutions:
- Ticket command 1 was split into serial build and focused compiled witness commands so the `dist/` consumer ran after the producer.
- Ticket command 2 (`pnpm turbo test`) was substituted by the ticket acceptance suite `pnpm -F @ludoforge/engine test:all`, which covers the engine package surface changed by this YAML/test/fixture ticket. No runner or non-engine package files changed.

Generated artifact provenance:
- artifact path(s): `packages/engine/test/architecture/fixtures/178-outcome-parity-1005.json`, `packages/engine/test/architecture/fixtures/178-outcome-parity-1008.json`, `packages/engine/test/architecture/fixtures/178-outcome-parity-1009.json`, `packages/engine/test/architecture/fixtures/178-outcome-parity-1011.json`, `packages/engine/test/architecture/fixtures/178-outcome-parity-1013.json`
- generation command: `node /tmp/refresh-188fitlfoufac-009-outcome-parity.mjs 1005 1011 1008 1013 1009`
- canonical inputs: production FITL GameSpecDoc after NVA skeleton binding, existing fixture `maxTurns`, seeds 1005/1011/1008/1013/1009, and `arvn-evolved` profile capture logic from `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts`
- expected refresh reason: the NVA seat now uses authored plan-template/doctrine behavior instead of the flat baseline, which intentionally shifts full-game trajectory before later ARVN continued-deepening chooseOne decisions.
- generator durability: ad hoc generator body recorded in this ticket outcome; it copied the test's `captureOutcomeParity` logic and wrote only the five Spec 178 outcome parity fixtures.
- hygiene proof: isolated parity test passed after refresh; full `pnpm -F @ludoforge/engine test:all` passed.

Generator body:

```js
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PolicyAgent } from '/home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '/home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/src/kernel/index.js';
import { runGame } from '/home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/src/sim/index.js';
import { compileProductionSpec } from '/home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/helpers/production-spec-helpers.js';

const REPO_ROOT = '/home/joeloverbeck/projects/ludoforge-llm';
const PLAYER_COUNT = 4;
const PROFILE_ID = 'arvn-evolved';

const fixturePathForSeed = (seed) =>
  join(REPO_ROOT, 'packages', 'engine', 'test', 'architecture', 'fixtures', `178-outcome-parity-${seed}.json`);

const profileForSeat = (seatId) =>
  seatId.toLowerCase() === 'arvn' ? PROFILE_ID : `${seatId.toLowerCase()}-baseline`;

const selectedValueFor = (decision) =>
  'value' in decision ? decision.value : null;

const collectCandidates = (agentDecision) => (agentDecision.candidates ?? []).map((candidate) => ({
  stableMoveKey: candidate.stableMoveKey,
  score: candidate.score,
  scoreContributions: candidate.scoreContributions,
  unknownPreviewRefs: candidate.unknownPreviewRefs ?? [],
  previewFallbackFired: candidate.previewFallbackFired ?? null,
  selectionReason: candidate.selectionReason,
  previewOutcome: candidate.previewOutcome ?? null,
  previewDrive: candidate.previewDrive ?? null,
}));

const normalize = (value) =>
  JSON.parse(`${JSON.stringify(value, (_key, nested) => (typeof nested === 'bigint' ? nested.toString() : nested), 2)}\n`);

const captureOutcomeParity = (seed, maxTurns) => {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const agents = (def.seats ?? []).map((seat) => new PolicyAgent({
    profileId: profileForSeat(String(seat.id)),
    traceLevel: 'verbose',
  }));
  const trace = runGame(def, seed, agents, maxTurns, PLAYER_COUNT, { skipDeltas: true }, runtime);
  const decisions = trace.decisions
    .filter((entry) => entry.decisionContextKind === 'chooseOne')
    .filter((entry) => entry.agentDecision?.resolvedProfileId === PROFILE_ID)
    .filter((entry) => entry.agentDecision?.previewUsage.coverage.strategy === 'continuedDeepening')
    .map((entry) => {
      const agentDecision = entry.agentDecision;
      if (!agentDecision) {
        throw new Error('continuedDeepening ARVN chooseOne decisions must include policy trace metadata');
      }
      return {
        turnCount: null,
        turnId: entry.turnId ?? null,
        decisionKey: String(entry.decisionKey),
        selectedValue: selectedValueFor(entry.decision),
        selectedStableMoveKey: agentDecision.selectedStableMoveKey ?? null,
        previewUsage: agentDecision.previewUsage,
        advisories: agentDecision.advisories ?? [],
        scoreContributionsByOption: collectCandidates(agentDecision),
      };
    });
  if (decisions.length === 0) {
    throw new Error(`seed ${seed} must exercise arvn-evolved continuedDeepening chooseOne decisions`);
  }
  return normalize({ seed, maxTurns, profileId: PROFILE_ID, decisions });
};

const seeds = process.argv.slice(2).map((value) => Number(value));
if (seeds.length === 0 || seeds.some((seed) => !Number.isInteger(seed))) {
  throw new Error('Usage: node /tmp/refresh-188fitlfoufac-009-outcome-parity.mjs <seed...>');
}

for (const seed of seeds) {
  const fixturePath = fixturePathForSeed(seed);
  if (!existsSync(fixturePath)) {
    throw new Error(`fixture does not exist: ${fixturePath}`);
  }
  const current = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const refreshed = captureOutcomeParity(seed, current.maxTurns);
  writeFileSync(fixturePath, `${JSON.stringify(refreshed, null, 2)}\n`);
  console.log(`refreshed ${fixturePath} decisions=${refreshed.decisions.length}`);
}
```

Source-size notes:
- `data/games/fire-in-the-lake/92-agents.md` is authored data and was already over source-file guidance; this ticket's 400-line growth is data-only YAML authoring explicitly required by Spec 188.
- New TypeScript test/helper files are 51, 58, and 70 lines; no TypeScript source-size hard gate triggered.
