# 188FITLFOUFAC-010A: Generic parity-witness performance prerequisite exposed by VC skeleton authoring

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic policy preview / simulation / profile-proof performance only
**Deps**: `archive/tickets/188FITLFOUFAC-009.md`

## Problem

Live implementation of `tickets/188FITLFOUFAC-010.md` added the VC Phase-2 skeleton as Tier-1 YAML plus two warning-class VC witnesses. The focused VC witnesses passed after `pnpm -F @ludoforge/engine build`, but the ticket's required broad lane could not complete: `pnpm -F @ludoforge/engine test:all` stalled after `dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js`, and isolated proof showed `packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` timed out after 120 seconds with only `TAP version 13`.

That parity witness is a generic architecture invariant. Under `docs/FOUNDATIONS.md` #1, #10, #15, and #16, `010` cannot close by weakening its broad-suite proof, removing VC signature skeleton bindings, or adding FITL-specific runtime branches. This prerequisite owns the generic investigation/fix needed so VC skeleton authoring can remain YAML-only and still pass the broad architecture lane.

## Assumption Reassessment (2026-05-22)

1. The abandoned `010` VC YAML/test probe was removed before this prerequisite handoff; no source/test/schema implementation diff is retained in this ticket.
2. The blocker reproduced without subtest output in `policy-preview-inner-outcome-parity.test.js`, and seed probes showed seeds 1005/1011/1008/1013 exceeded 30 seconds while seed 1009 completed in about 26 seconds. This is a generic policy-preview/parity performance blocker, not a VC witness assertion failure.
3. Foundations forbid solving this by FITL-specific engine logic or by silently under-authoring the VC signature skeleton. The fix must preserve authored GameSpecDoc policy data and deterministic bounded computation.

## Architecture Check

1. Fix or bound the generic parity/proposal/preview path rather than adding faction-specific runtime exceptions.
2. Preserve GameSpecDoc as the authored policy surface; VC-specific tactical content returns to `tickets/188FITLFOUFAC-010.md`.
3. Keep the Spec 178 parity witness meaningful: if its current fixture shape is too expensive after later authored profiles, replace it only with an equally generic, bounded, deterministic witness that still proves the architectural invariant.

## What to Change

### 1. Isolate the performance owner

Identify why binding the VC skeleton makes `policy-preview-inner-outcome-parity.test.js` fail to produce a first subtest result within 120 seconds. Narrow to the first generic owner, such as plan proposal role binding, preview/deepening execution, full-game fixture size, or the parity witness fixture shape.

### 2. Apply a generic fix or witness correction

Implement the smallest generic correction that restores bounded proof. Valid outcomes include a production performance/termination fix, a generic test fixture reduction that preserves the parity invariant, or an explicit boundedness guard in the parity witness. Invalid outcomes include FITL faction allowlists, action-id shortcuts, or removing VC skeleton requirements from `010`.

### 3. Preserve the VC handoff contract

After the generic blocker is fixed, `tickets/188FITLFOUFAC-010.md` must be able to resume as Tier-1 YAML authoring with its two headline VC witnesses and broad engine acceptance lane.

## Files to Touch

- `packages/engine/src/agents/` (modify only if the generic planner/preview owner is production code)
- `packages/engine/src/sim/` or `packages/engine/src/kernel/` (modify only if the generic bounded execution owner is there)
- `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts` (modify only if the witness shape is the true owner)
- `packages/engine/test/architecture/fixtures/178-outcome-parity-*.json` (modify only if fixture refresh/reduction is the chosen generic proof)
- `packages/engine/test/unit/` or `packages/engine/test/architecture/` (add/modify focused generic regression coverage)

## Out of Scope

- Authoring the VC skeleton itself; that returns to `tickets/188FITLFOUFAC-010.md`.
- Changing the US/NVA/ARVN authored skeletons.
- FITL-specific engine/compiler/kernel branches, faction allowlists, or action-id shortcuts.
- Treating `pnpm -F @ludoforge/engine test:all` as optional for `010`.

## Acceptance Criteria

### Tests That Must Pass

1. A focused command reproduces and then proves the generic parity/performance fix, including `node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js`.
2. The focused generic regression added or updated for this ticket passes.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. No FITL-specific identifiers appear in engine/compiler/simulator implementation logic.
2. The parity witness remains deterministic and bounded.
3. `tickets/188FITLFOUFAC-010.md` can resume VC YAML authoring after this prerequisite without narrowing its signature-template deliverable or broad-suite proof lane.

## Test Plan

### New/Modified Tests

1. A focused generic regression in `packages/engine/test/unit/` or `packages/engine/test/architecture/` covering the isolated owner.
2. `policy-preview-inner-outcome-parity.test.ts` or its fixtures only when the witness shape itself is corrected.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js`
2. `pnpm -F @ludoforge/engine test:all`

## Outcome

Completed: 2026-05-22

What changed:

1. Corrected the generic Spec 178 policy-preview outcome-parity witness shape in `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts`.
   - The production FITL GameDef now compiles once per test process instead of once per seed.
   - The fixture window is intentionally pinned to `maxTurns: 1`, with an assertion that rejects broader regenerated fixtures.
   - The five existing witness seeds are preserved, and every seed still exercises `arvn-evolved` `continuedDeepening` `chooseOne` decisions.
2. Refreshed the five existing outcome-parity fixtures:
   - `packages/engine/test/architecture/fixtures/178-outcome-parity-1005.json` — 33 decisions, `maxTurns: 1`
   - `packages/engine/test/architecture/fixtures/178-outcome-parity-1008.json` — 3 decisions, `maxTurns: 1`
   - `packages/engine/test/architecture/fixtures/178-outcome-parity-1009.json` — 28 decisions, `maxTurns: 1`
   - `packages/engine/test/architecture/fixtures/178-outcome-parity-1011.json` — 32 decisions, `maxTurns: 1`
   - `packages/engine/test/architecture/fixtures/178-outcome-parity-1013.json` — 33 decisions, `maxTurns: 1`

Deviations from original plan:

1. The isolated owner was the witness shape, not production planner/preview/runtime code. No `packages/engine/src/` files changed.
2. The focused parity command still takes about 150 seconds serially and about 242 seconds under full-suite contention, but it now emits a completed passing result instead of timing out or blocking the broad lane.
3. No new separate regression file was added; the existing architecture invariant was updated directly because it is the generic regression surface named by the ticket.

Generated artifact provenance:

- artifact path(s): `packages/engine/test/architecture/fixtures/178-outcome-parity-{1005,1008,1009,1011,1013}.json`
- generation command: `node --input-type=module -e "<body below>"`
- canonical inputs: production FITL GameSpecDoc on 2026-05-22 after `188FITLFOUFAC-009`, seeds `1005`, `1011`, `1008`, `1013`, `1009`, `maxTurns: 1`, `arvn-evolved` profile capture logic from `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts`
- expected refresh reason: generic fixture-window reduction from full 100-turn captures to first-turn parity captures while preserving the five-seed continued-deepening outcome oracle
- generator durability: ad hoc generator body recorded in this ticket outcome
- hygiene proof: `pnpm -F @ludoforge/engine build`, focused parity witness, `pnpm -F @ludoforge/engine test:all`, and pending final markdown/JSON whitespace checks

```js
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PolicyAgent } from './packages/engine/dist/src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from './packages/engine/dist/src/kernel/index.js';
import { runGame } from './packages/engine/dist/src/sim/index.js';
import { compileProductionSpec } from './packages/engine/dist/test/helpers/production-spec-helpers.js';

const seeds = [1005, 1011, 1008, 1013, 1009];
const profileId = 'arvn-evolved';
const maxTurns = 1;
const { compiled } = compileProductionSpec();
const def = assertValidatedGameDef(compiled.gameDef);
const profileForSeat = (seatId) =>
  String(seatId).toLowerCase() === 'arvn' ? profileId : `${String(seatId).toLowerCase()}-baseline`;
const selectedValueFor = (decision) => Object.prototype.hasOwnProperty.call(decision, 'value') ? decision.value : null;
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
const normalize = (value) => JSON.parse(JSON.stringify(
  value,
  (_key, nested) => typeof nested === 'bigint' ? nested.toString() : nested,
  2,
));

for (const seed of seeds) {
  const runtime = createGameDefRuntime(def);
  const agents = (def.seats ?? []).map((seat) => new PolicyAgent({
    profileId: profileForSeat(seat.id),
    traceLevel: 'verbose',
  }));
  const trace = runGame(def, seed, agents, maxTurns, 4, { skipDeltas: true }, runtime);
  const decisions = trace.decisions
    .filter((entry) => entry.decisionContextKind === 'chooseOne')
    .filter((entry) => entry.agentDecision?.resolvedProfileId === profileId)
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
    throw new Error(`seed ${seed} did not exercise arvn-evolved continuedDeepening chooseOne decisions`);
  }
  const output = normalize({ seed, maxTurns, profileId, decisions });
  const path = join(
    'packages',
    'engine',
    'test',
    'architecture',
    'fixtures',
    `178-outcome-parity-${seed}.json`,
  );
  writeFileSync(path, `${JSON.stringify(output, null, 2)}\n`);
  console.log(path, decisions.length);
}
```

Verification:

1. Reproduced the pre-fix blocker: `timeout 150s node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` emitted only `TAP version 13` and exited `124`.
2. `pnpm -F @ludoforge/engine build` — passed.
3. `node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` — passed, 5 tests.
4. `pnpm -F @ludoforge/engine test:all` — passed, 958 tests.

VC handoff:

`tickets/188FITLFOUFAC-010.md` can resume VC YAML authoring with its two headline VC witnesses and broad engine acceptance lane. This ticket did not narrow `010`'s signature-template deliverable or `test:all` proof lane.
