# 138ENUTIMTEM-001: Characterize failing-seed chooseN draw space and check in I1 fixture

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — investigation + fixture only
**Deps**: `specs/138-enumerate-time-template-viability-classifier.md`

## Problem

Spec 138's Investigation I1 (Required Investigation §) mandates that before any implementation work begins, the failing NVA `march` template's head-chooseN draw space on seeds 1002 and 1010 is characterized exhaustively. The existing diagnostic scripts (`diagnose-agent-stuck.mjs`, `diagnose-existing-classifier.mjs`) prove the classifier returns `satisfiable` but do not enumerate per-option completion outcomes. Without that per-option table, T1's unit test in 138ENUTIMTEM-002 cannot assert the correct `viableHeadSubset` shape, and the spec's root-cause framing cannot be quantitatively grounded against the live seeds.

## Assumption Reassessment (2026-04-19)

1. `packages/engine/dist/src/kernel/move-decision-completion.js` exports `completeMoveDecisionSequence`. Confirmed via Step 2 spec reassessment.
2. `packages/engine/dist/src/kernel/apply-move.js` exports `probeMoveViability`. Confirmed.
3. `packages/engine/test/fixtures/gamestate/` directory is the canonical location for state fixtures. Confirmed via `ls packages/engine/test/fixtures/gamestate/`.
4. Seed 1002 head chooseN has 44 options; seed 1010 has 30. Confirmed via `diagnose-existing-classifier.mjs` output on 2026-04-19. The earlier spec-132 observation of 29 options was a different state.

## Architecture Check

1. Investigation-only ticket: no production-code changes. Pure measurement + fixture generation.
2. Fixtures are JSON snapshots of classified outcomes, not executable game state — they violate no Foundation because they carry no runtime semantics.
3. Per the spec's "Precedent" note on `diagnose-existing-classifier.mjs`, investigation scripts for reshaping spec framing are checked in as reproducible I0/I1 fixtures. This ticket extends that pattern to I1.

## What to Change

### 1. Author the characterization script

Create `campaigns/fitl-arvn-agent-evolution/diagnose-draw-space-distribution.mjs` (sibling to the existing `diagnose-*.mjs` files). It MUST:
- Accept `--seed` and `--max-turns` arguments (default seed `1002`, max-turns `200`), matching the interface of sibling scripts.
- Replay the failing trajectory with the `CaptureAgent` pattern used in `diagnose-existing-classifier.mjs` to obtain `capturedInput` at the pre-terminal state.
- For each legal move with `viability.viable && !viability.complete`, call `completeMoveDecisionSequence` with an identity chooser to discover the head `chooseN` decision.
- For each option in the head's `options` array, classify the forced-head partial move via the same `legalChoicesDiscover` + recursive satisfiability seam that the kernel's chooseN probe path uses, so the fixture reflects the live viability classifier rather than a one-off deterministic downstream walk.
- Classify each option's outcome as one of: `completed`, `stochasticUnresolved`, `illegal`, `choiceValidationFailed`, `budgetExceeded`, or `unknown`.
- Output a table to stderr (per-option index, value, outcome) and write a machine-readable JSON fixture to stdout.

### 2. Run the script and persist fixtures

Run on both failing seeds:
```
node campaigns/fitl-arvn-agent-evolution/diagnose-draw-space-distribution.mjs --seed 1002 --max-turns 200 > packages/engine/test/fixtures/gamestate/spec-138-march-draw-space-seed-1002.json
node campaigns/fitl-arvn-agent-evolution/diagnose-draw-space-distribution.mjs --seed 1010 --max-turns 200 > packages/engine/test/fixtures/gamestate/spec-138-march-draw-space-seed-1010.json
```

Each fixture MUST contain:
- `seed: number`
- `stateHash: string`
- `activePlayer: number`
- `moves`: array of `{ actionId, headDecisionKey, headOptionCount, optionOutcomes: Array<{ index, value, outcome }> }`

### 3. Document findings in the fixtures' companion README

Append a short section to `packages/engine/test/fixtures/gamestate/README.md` (create if absent) describing the fixtures' purpose, the head option counts per seed, and the viable-subset size observed.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/diagnose-draw-space-distribution.mjs` (new)
- `packages/engine/test/fixtures/gamestate/spec-138-march-draw-space-seed-1002.json` (new)
- `packages/engine/test/fixtures/gamestate/spec-138-march-draw-space-seed-1010.json` (new)
- `packages/engine/test/fixtures/gamestate/README.md` (new or modify)

## Out of Scope

- No changes to `decision-sequence-satisfiability.ts`, `prepare-playable-moves.ts`, or any production engine code.
- No addition of a new viability code or classifier method.
- No seed expansion beyond 1002 and 1010.
- No changes to `tickets/` or `specs/138*` — this ticket produces fixtures consumed by downstream tickets.

## Acceptance Criteria

### Tests That Must Pass

1. Running the script on seed 1002 writes a valid JSON fixture with `headOptionCount === 44` for the first `march` move.
2. Running the script on seed 1010 writes a valid JSON fixture with `headOptionCount === 30`.
3. Both fixtures' `optionOutcomes` arrays sum to their respective `headOptionCount`.
4. Existing suite: `pnpm turbo lint` passes (no new lint violations in the script).
5. Existing suite: `pnpm run check:ticket-deps` still passes.

### Invariants

1. The fixtures contain no randomness artifacts (e.g., no PRNG state snapshots) — only deterministic per-option outcomes under the canonical option order.
2. The script imports from `packages/engine/dist/` (not `src/`) to match the sibling `diagnose-*.mjs` pattern and avoid a full-build loop.
3. Each option's outcome is classified deterministically via the kernel's probe/discover path — not random sampling — so re-running the script produces byte-identical fixtures.

## Test Plan

### New/Modified Tests

1. No new test files — this ticket produces fixtures that 138ENUTIMTEM-002 consumes in T1. Manual verification via the commands below.

### Commands

1. `pnpm -F @ludoforge/engine build` (to ensure `dist/` is current before running the script)
2. `node campaigns/fitl-arvn-agent-evolution/diagnose-draw-space-distribution.mjs --seed 1002 --max-turns 200`
3. `node campaigns/fitl-arvn-agent-evolution/diagnose-draw-space-distribution.mjs --seed 1010 --max-turns 200`
4. `pnpm turbo lint` (sanity check for script lint compliance)

## Outcome

- Implemented `campaigns/fitl-arvn-agent-evolution/diagnose-draw-space-distribution.mjs` and checked in the two requested JSON fixtures plus `packages/engine/test/fixtures/gamestate/README.md`.
- Observed live viable-subset split: seed `1002` first captured `march` move `44/44 completed`; seed `1010` captured `march` move `1/30 completed`.
- ticket corrections applied: `"small viable subset" on both seeds -> live split is 44/44 on seed 1002 and 1/30 on seed 1010`; `deterministic downstream chooser wording -> kernel probe/discover classification seam used for stable live viability measurement`
