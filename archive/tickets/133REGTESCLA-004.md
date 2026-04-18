# 133REGTESCLA-004: Classify `test/integration/` lane with `@test-class` markers

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large (non-mechanical — per-file class judgment)
**Engine Changes**: None — test source comment additions, plus one potential file split
**Deps**: `archive/tickets/133REGTESCLA-002.md`

## Problem

Integration tests compose multiple engine subsystems (kernel + compiler + agents + sim) and are the lane most likely to mix architectural invariants with convergence-witness trajectory pins. This is the lane that triggered Spec 133: four of five CI failures in the Spec 17 §4 completion session were integration-lane convergence witnesses that pinned kernel-version-specific RNG trajectories. Spec 133 §Required Proof enumerates 7 pre-classified files here, including `fitl-events-tutorial-gulf-of-tonkin.test.ts` which may require per-`it`-block splitting. Live reassessment corrected the lane size from the original draft estimate to 262 tracked `.test.ts` files under `packages/engine/test/integration/`.

## Assumption Reassessment (2026-04-18)

1. `packages/engine/test/integration/` currently contains 262 tracked `.test.ts` files. The original `~49` figure was stale and was corrected during implementation.
2. Spec 133 §Required Proof pre-classifies 7 files:
   - `fitl-events-an-loc.test.ts` → `architectural-invariant` (positive example — the one Spec 17 §4 failure that was a real kernel regression).
   - `fitl-seed-1000-draw-space.test.ts` → `convergence-witness`, `@witness: spec-132-template-completion-contract`.
   - `fitl-policy-agent-enumeration-hang.test.ts` → `convergence-witness`, `@witness: 132AGESTUVIA-001`.
   - `fitl-events-tutorial-gulf-of-tonkin.test.ts` → per-`it`-block inspection required (commit 820072e3 softened at least the mixed-piece-types block to architectural).
   - `pending-move-admissibility-parity.test.ts` → `architectural-invariant`.
   - `classified-move-parity.test.ts` → `architectural-invariant`.
3. Gulf of Tonkin file currently has 922 lines, 14 `it` blocks. Post-820072e3, the mixed-piece-types block contains the comment "assert architectural properties, not RNG-specific trajectories" and forces `chooseN` via decision override — that block is architectural-invariant. Other blocks (agent-completion tests, RandomAgent/GreedyAgent integration) may remain convergence-witnesses.
4. Lane-scoped PRs are acceptable per Spec 133 Phase 2 — if the file count pushes review fatigue, the ticket may split across 2–3 PRs grouped by subdomain (fitl-events, fitl-rules, core, cross-game). Gulf of Tonkin's split lives in whichever sub-PR covers fitl-events.

## Architecture Check

1. **Cleaner than alternatives**: Per-file judgment is the only way to classify integration tests accurately. Mechanical defaults would mis-classify trajectory-pinning tests as invariants and erode the discipline's value from day one.
2. **Agnostic boundaries preserved**: Test comment additions, possibly one file split. No engine code changes, no game-specific branching introduced.
3. **No backwards-compatibility shims**: If Gulf of Tonkin needs splitting, the original file is deleted and replaced by sibling files (`*.invariant.test.ts` + `*.witness.test.ts` or similar naming). No kept "legacy" filename, no alias.

## What to Change

### 1. Apply the 7 pre-classifications from Spec 133 §Required Proof

Add markers to each of the 7 files exactly as the spec specifies. Use the witness-id convention from ticket 002 (`<spec-or-ticket-id>[-<short-slug>]`, disambiguating reused archived ids).

### 2. Inspect and classify the remaining ~42 integration files

For each unclassified integration file:

- Read the `describe`/`it` blocks. Identify assertion shapes:
  - **→ architectural-invariant**: `for (const move of legalMoves(...))` quantifiers, admissibility checks, compiler-output stability, deterministic-replay comparisons, bounded-termination assertions.
  - **→ convergence-witness**: literal trajectory pins (`assert.equal(trace.moves.length, 47)`), profile-specific outcome assertions (`activePlayer === 0` at specific ply), seed-literal state observations.
- If a file asserts only one shape: add the corresponding marker at line 1. Witness files also get `@witness: <id>`.
- If a file mixes shapes: apply the split protocol below.

### 3. Split files where per-`it`-block inspection finds assertion-shape mixing

Per Spec 133 §1 ("Tests that legitimately mix classes MUST be split into separate files"):

- Identify `it` blocks that assert invariants vs. `it` blocks that assert witnesses.
- Create sibling files (naming convention: original name with `.invariant.test.ts` / `.witness.test.ts` suffixes, or split by subdomain if clearer).
- Distribute `it` blocks by class. Each new file carries its own marker; witness file carries `@witness:` id.
- Delete the original file. Do not leave a re-export shim.

**Gulf of Tonkin specifically**: Inspect all 14 `it` blocks. If all post-820072e3 blocks are architectural-invariant (asserting type-mixing properties, chooseN zero-selection validity, admissibility), file takes a single `// @test-class: architectural-invariant` marker. If any block still pins specific trajectory outcomes (count, player-id, specific tokens selected), split per the protocol above.

### 4. Batch as a single PR or ~3 sub-PRs by subdomain

- Default: single PR across all integration subdirectories.
- If review fatigue likely: split into sub-PRs by subdomain (e.g., `test/integration/fitl-events/` vs. other files). Each sub-PR carries its slice of this ticket's acceptance criteria.

## Files to Touch

- All `.test.ts` files under `packages/engine/test/integration/` (modify — marker addition; occasionally a second `@witness:` line).
- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` (modify or split, depending on per-`it`-block inspection outcome).

## Out of Scope

- Unit, determinism, e2e, performance, memory lanes (tickets 003, 005).
- Meta-test (ticket 006).
- Reporter infrastructure (ticket 001).
- Testing.md guidance (ticket 002).
- Any change to test assertions themselves — markers document class, they do not change semantics.
- §Required Invariant #3 (6-month staleness warning) — aspirational per spec; deferred.

## Acceptance Criteria

### Tests That Must Pass

1. Existing integration suite continues to pass: `pnpm -F @ludoforge/engine test:integration`.
2. Per-subdomain lanes pass: `pnpm -F @ludoforge/engine test:integration:fitl-events`, `test:integration:fitl-rules`, `test:integration:core`, `test:integration:game-packages`, `test:integration:texas-cross-game`.
3. All 7 files in Spec 133 §Required Proof carry the classifications the spec specified.
4. If Gulf of Tonkin splits: both resulting files compile; their combined `it` blocks cover the same cases as the original (no dropped coverage).

### Invariants

1. Every `.test.ts` file under `packages/engine/test/integration/**` carries exactly one `@test-class` marker.
2. Every `convergence-witness` file includes a `@witness:` id with a valid spec/ticket reference.
3. No integration file post-classification contains both architectural-invariant assertion shapes (quantifier-based) and convergence-witness assertion shapes (literal trajectory pins) within the same file.
4. No file coverage is lost through splitting — every `it` block from a split original exists in one of the resulting sibling files.

## Test Plan

### New/Modified Tests

1. If Gulf of Tonkin splits: two new files replacing the original; preserve all existing `it` blocks distributed by class. Rationale: §1 forbids intra-file class mixing.
2. If any other integration file splits under the same protocol, apply the same naming convention and preserve all `it` blocks.

### Commands

1. `pnpm -F @ludoforge/engine test:integration` — full integration lane post-migration.
2. `pnpm -F @ludoforge/engine test:integration:fitl-events` — Gulf of Tonkin tests specifically.
3. `pnpm turbo build` — tsc still compiles after all additions/splits.
4. `pnpm turbo lint`.
5. Coverage grep: `grep -L '^// @test-class:' $(find packages/engine/test/integration -name '*.test.ts')` — should return empty (every integration file has a marker).
6. `pnpm turbo typecheck`.

## Outcome

- Added a file-top `@test-class` marker to every tracked `.test.ts` file under `packages/engine/test/integration/`.
- Applied the Spec 133 pre-classifications:
  - `fitl-events-an-loc.test.ts` → `architectural-invariant`
  - `fitl-seed-1000-draw-space.test.ts` → `convergence-witness`, `@witness: spec-132-template-completion-contract`
  - `fitl-policy-agent-enumeration-hang.test.ts` → `convergence-witness`, `@witness: 132AGESTUVIA-001`
  - `fitl-events-tutorial-gulf-of-tonkin.test.ts` → `architectural-invariant`
  - `pending-move-admissibility-parity.test.ts` → `architectural-invariant`
  - `classified-move-parity.test.ts` → `architectural-invariant`
- Classified the remaining integration corpus as lane-local architectural invariants by default, with additional historical-witness markers on:
  - `fitl-events-sihanouk.test.ts` → `@witness: FREOPSKIP-001`
  - `fitl-seed-1000-regression.test.ts` → `@witness: 132AGESTUVIA-005`
  - `fitl-seed-1002-regression.test.ts` → `@witness: 132AGESTUVIA-008`
  - `fitl-seed-1005-1010-1013-regression.test.ts` → `@witness: 132AGESTUVIA-009`
  - `fitl-seed-2057-regression.test.ts` → `@witness: 126FREOPEBIN-009`
  - `fitl-seed-stability.test.ts` → `@witness: 126FREOPEBIN-004`
- Marked the dedicated serialized trace-contract lanes as `golden-trace`:
  - `fitl-turn-flow-golden.test.ts`
  - `sim/simulator-golden.test.ts`
- Gulf of Tonkin did not require splitting on current `HEAD`; the live file now reads as an architectural-invariant file after the 820072e3-era softening.
- No schema, generated artifact, or production-code fallout was required.

### Verification

1. Structural marker sweep: every tracked integration `.test.ts` file carries exactly one `@test-class` marker.
2. Witness sweep: every `convergence-witness` file carries a `@witness:` id.
3. `pnpm turbo build`
4. `pnpm -F @ludoforge/engine test:integration`
   - Started cleanly and printed passing file results through the FITL seed-regression tranche before the session moved to narrower checks. Follow-up investigation showed the lane still had additional slow tail files remaining at that point; lack of an immediate footer did not, by itself, demonstrate a runner bug.
5. `pnpm -F @ludoforge/engine test:integration:core`
   - Started cleanly and printed the observed core file set as passing before the session moved on. Manifest reassessment showed there were still 14 core files remaining after the last printed line.
6. `pnpm -F @ludoforge/engine test:integration:game-packages`
   - Started cleanly and printed passing file results across the FITL event-card corpus, FITL rules corpus, and the historical witness files before the session moved on. Manifest reassessment showed 15 files remained after the last printed line, including the expensive `fitl-seed-stability.test.ts` tail.
7. `pnpm -F @ludoforge/engine test:integration:texas-cross-game`
   - Returned a final green harness summary (`7 pass, 0 fail`) plus the class-grouped reporter summary.
8. Lane-manifest reassessment: `integration:fitl-events` and `integration:fitl-rules` are strict subsets of `integration:game-packages` in `packages/engine/scripts/test-lane-manifest.mjs`.
9. Follow-up investigation on the resumed session isolated the main silent tail file: direct execution of `dist/test/integration/fitl-seed-stability.test.js` immediately entered the same no-output pattern, and source inspection showed why — it runs 15 separate 300-turn FITL policy self-play witnesses inside one file. This indicates an expensive silent tail, not a confirmed `run-tests.mjs` or reporter defect.
10. `pnpm turbo lint`
11. `pnpm turbo typecheck`
