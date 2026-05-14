# 172POLEVASTA-001: Phase 0 — large-board/cube-heavy preview-drive perf witness (failing pre-fix)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — opt-in/test-internal builder counters only; no runtime semantics change (perf-witness harness + instrumentation mode)
**Deps**: `specs/172-policy-eval-static-structure-caching.md`

## Problem

The `fitl-arvn-agent-evolution` campaign is paused: a deep continued-deepening preview combined with realistic cube-heavy ARVN play is currently infeasible to simulate (one FITL seed: >15 min, never completes) purely because the policy-evaluation preview path rebuilds static/derived structures per microturn-option evaluation (`reports/fitl-arvn-policy-eval-context-rebuild-scaling-2026-05-14.md`).

The existing `profile-fitl-preview-drive.mjs` witness defaults to a small-board, `--maxTurns 10`-style regime that **never reaches** the cube-heavy state where the rebuild seam dominates runtime. Spec 172 §6.3 calls this out explicitly: without a large-board witness, the seam silently recurs.

Per Foundation #16 (Testing as Proof) and the spec's Phase 0 (§5, §10), the failing witness must be authored and observed failing **before** any §4.1–§4.5 fix lands. This ticket adds that witness. It is the shared dependency for every fix phase — each of `172POLEVASTA-002`…`-005` verifies a `build*` self-time drop against this harness.

## Assumption Reassessment (2026-05-14)

1. `packages/engine/scripts/profile-fitl-preview-drive.mjs` exists (798 lines), is flag-driven (`--maxTurns`, `--profilesAll`, `--label`, …), explicitly "NOT a test, does not assert, exits 0 on success". Confirmed.
2. `campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs` exists and is the trigger-report repro driver (`--only`, `--max-turns`, `--seeds`; default `max-turns 200`). Confirmed.
3. `packages/engine/test/perf/agents/` already hosts preview-drive perf tests (`fitl-parity-drive.perf.test.ts`, `fitl-per-card-cost.perf.test.ts`) under the `*.perf.test.ts` naming convention — the natural home for this witness.
4. The four rebuild seams the witness must observe are `buildEncodedStateLayout` (`packages/engine/src/kernel/encoded-state/layout.ts:131` — note: spec §2.2/§8 cite `:66`, the symbol has since moved to `:131`), `buildFeatureTable` (`packages/engine/src/cnl/policy-bytecode/feature-table.ts:156`), `buildExpressionFeatureTable` (`packages/engine/src/cnl/policy-bytecode/compile.ts:59`), and `buildEncodedState` (`packages/engine/src/kernel/encoded-state/view.ts:214`). All confirmed present.
5. Approved boundary correction (2026-05-14): the draft's "Engine Changes: None" claim conflicts with the deterministic `build*` count oracle because the four named builders do not currently expose logical counters. The user approved widening Phase 0 to add opt-in/test-internal builder counters while preserving the no-semantics-change boundary. The only stale reference is the `layout.ts:66` → `:131` line drift noted above; it does not change the witness design.

## Architecture Check

1. **Witness-first (TDD) is cleaner than fix-first**: a failing witness pinned to the regime that exposed the regression proves the seam against the conditions that bite, and guarantees the fix is measured against the right state size. Adding caches first and a witness last (the prior Spec 172 ordering) leaves the seam unproven until the end.
2. **Agnostic boundaries preserved**: the witness drives the existing FITL production fixture through the existing `runGame` / `driveSyntheticCompletion` path. The only engine-code additions are generic test/internal counters on the four builder functions (`build*` over `GameDef`/`GameState`); they do not change rules, state, cache behavior, GameSpecDoc, or GameDef output.
3. **No backwards-compat shims**: this ticket adds a new harness case and an instrumentation/assertion mode to a dev script; it deletes nothing and aliases nothing.

## What to Change

### 1. Add a large-board / cube-heavy case to the perf script

Extend `packages/engine/scripts/profile-fitl-preview-drive.mjs` with a named case (e.g. `--case arvn-cubes-deep` or an analogous flag) that:

- selects a FITL profile carrying the deep `inner` preview config (continued-deepening, `depthCap`/`maxOptions` per the `arvn-evolved` profile);
- drives a seed where ARVN piece count climbs high (the trigger report uses seed `1013`, `--max-turns 200`);
- runs through the existing `runGame` path under `forkGameDefRuntimeForRun(runtime)`.

### 2. Add `build*` instrumentation / counter mode

Add an instrumentation mode that counts calls to `buildEncodedStateLayout`, `buildFeatureTable`, `buildExpressionFeatureTable`, and `buildEncodedState` during the drive. Counters must be deterministic logical counts — wall-clock is diagnostic only, not the assertion oracle (spec §6.3; Foundation #8). This ticket owns the minimal test/internal counter exports needed to observe those builders.

### 3. Add the failing perf-witness test

Add `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` that drives the large-board case and asserts the combined `build*` count/self-time stays below a small **first-touch-only** threshold. Pre-fix this **fails** (or the case times out under a deterministic budget). Declare the file's `@test-class` marker — classify as `convergence-witness` with `@witness: 172POLEVASTA-001` (the witness is seed-specific; a seed where ARVN piece count is high). Document in the file header that the assertion is *expected to fail* until `172POLEVASTA-002`…`-005` land, and that `172POLEVASTA-006` flips it to passing.

## Files to Touch

- `packages/engine/scripts/profile-fitl-preview-drive.mjs` (modify) — large-board case + `build*` instrumentation mode
- `packages/engine/scripts/profile-fitl-preview-drive-metrics.mjs` (new or equivalent helper) — keep the near-cap profile script under the repo file-size limit while adding counter plumbing
- `packages/engine/src/kernel/encoded-state/layout.ts` (modify) — test/internal `buildEncodedStateLayout` logical counter
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (modify) — test/internal `buildFeatureTable` logical counter
- `packages/engine/src/cnl/policy-bytecode/compile.ts` (modify) — test/internal `buildExpressionFeatureTable` logical counter
- `packages/engine/src/kernel/encoded-state/view.ts` (modify) — test/internal `buildEncodedState` logical counter
- `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` (new) — failing perf witness

## Out of Scope

- Any change to `PolicyEvaluationContext`, `GameDefRuntime`, or the feature-table/bytecode/layout/encoded-state cache behavior — those are `172POLEVASTA-002`…`-005`. This ticket may add logical counter side channels to the existing builder functions only.
- Any change to the preview drive's bounds (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`) or the `arvn-evolved` profile — spec §3 non-goals.
- The constructor-invariant architectural test — that is `172POLEVASTA-006`.
- Any FITL game-spec or agent-profile change.

## Acceptance Criteria

### Tests That Must Pass

1. The new witness test **fails** (or times out within a deterministic budget) pre-fix — i.e. the combined `build*` work exceeds the first-touch-only threshold. This failing state is the deliverable.
2. Existing determinism gates stay green: `packages/engine/test/determinism/spec-140-replay-identity.test.ts`, `forked-vs-fresh-runtime-parity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts` / `-seed-123.test.ts`.
3. Existing suite: `pnpm -F @ludoforge/engine test:perf` still runs and is expected to surface the new Phase 0 red witness until `172POLEVASTA-002`…`-006` land.

### Invariants

1. The witness's assertion oracle is a deterministic logical count / self-time, never wall-clock — cache warmth and host speed must not change the witness verdict's *semantics* (Foundation #8).
2. The witness drives only the existing FITL fixture through the existing `runGame` path — no engine behavior change, no GameDef change.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` (new) — large-board/cube-heavy preview-drive case asserting combined `build*` work below a first-touch-only threshold; `@test-class: convergence-witness`, `@witness: 172POLEVASTA-001`. Authored failing per Foundation #16.
2. `packages/engine/scripts/profile-fitl-preview-drive.mjs` (modify) — manual verification: `node packages/engine/scripts/profile-fitl-preview-drive.mjs --case arvn-cubes-deep` prints the per-`build*` counts; the counts are high pre-fix.

### Commands

1. `pnpm -F @ludoforge/engine test:perf` (targeted — the new witness should fail pre-fix)
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test` (full engine suite — determinism gates stay green)

## Outcome (2026-05-14)

Phase 0 landed as a red witness. The approved boundary correction was applied: this ticket added generic test/internal logical counters for `buildEncodedStateLayout`, `buildFeatureTable`, `buildExpressionFeatureTable`, and `buildEncodedState`; no cache behavior, runtime semantics, GameSpecDoc, or GameDef output changed.

What landed:

- `packages/engine/scripts/profile-fitl-preview-drive.mjs` now accepts `--case arvn-cubes-deep`, defaulting that case to seed `1013`, `--maxTurns 200`, and `profileId=arvn-evolved`, and prints the four `build*` counters plus `staticRebuildCount`.
- `packages/engine/scripts/profile-fitl-preview-drive-metrics.mjs` holds extracted per-card/counter helper code so the near-cap profile script stays under the repo's 800-line cap.
- The four builder modules expose uniquely named test/internal counter handles; the counters are deterministic logical counts and carry no game-specific logic.
- `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` is the Phase 0 failing witness. It uses seed `1013` with a one-turn deterministic budget so the red witness completes locally instead of hanging on the full 200-turn repro.

Observed red witness:

- `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.js` fails as intended with `172POLEVASTA_STATIC_REBUILD_WITNESS total=31258 threshold=4 buildEncodedStateLayout=4985 buildFeatureTable=10617 buildExpressionFeatureTable=10617 buildEncodedState=5039 seed=1013 maxTurns=1 profiles=us-baseline,arvn-evolved,nva-baseline,vc-baseline`.
- `pnpm -F @ludoforge/engine test:perf` ran and is classified expected red for this ticket: 4 perf suites passed, and the only failing suite was the new `172POLEVASTA-001` witness with the same `total=31258` count. Existing advisory warnings remained advisory.

Verification:

- `pnpm -F @ludoforge/engine build` passed.
- `node packages/engine/scripts/profile-fitl-preview-drive.mjs --case arvn-cubes-deep --maxTurns 1 --noVerifyIncrementalHash` passed against the production FITL GameDef and printed `staticRebuildCount=85884` with per-builder fields in JSON/stderr.
- `node --check packages/engine/scripts/profile-fitl-preview-drive.mjs` passed.
- `node --check packages/engine/scripts/profile-fitl-preview-drive-metrics.mjs` passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js` passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/forked-vs-fresh-runtime-parity.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js` passed.
- `pnpm -F @ludoforge/engine lint` passed.
- `pnpm -F @ludoforge/engine typecheck` passed.
- `pnpm run check:ticket-deps` passed: `Ticket dependency integrity check passed for 6 active tickets and 2336 archived tickets.`

Verification substitutions:

- Root `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck` was split into package-local `build`, `lint`, and `typecheck` lanes because this ticket only touches `@ludoforge/engine` code/scripts/tests and the package-local lanes prove the touched surfaces without broad workspace cost.
- Full `pnpm -F @ludoforge/engine test` was not run; the ticket-named determinism files were run directly and `test:perf` was run/classified as expected red.
- The script's full `--case arvn-cubes-deep` default remains the long-form manual repro (`seed=1013`, `maxTurns=200`). The automated witness uses a one-turn deterministic budget to keep the pre-fix red witness bounded while preserving the same seed/profile/runGame seam.

Generated fallout: none. The only generated output touched during verification was `packages/engine/dist` from the build.

Source-size ledger:

- `packages/engine/scripts/profile-fitl-preview-drive.mjs | before 798 | after 761 | crossed cap? no | active growth no, net extraction | extraction/defer rationale: helper extraction kept the edited script below 800 lines | successor none`
- `packages/engine/scripts/profile-fitl-preview-drive-metrics.mjs | before 0 | after 130 | crossed cap? no | active growth new helper | extraction/defer rationale: small helper created for metric/per-card plumbing | successor none`
- `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts | before 0 | after 99 | crossed cap? no | active growth new witness | extraction/defer rationale: not needed | successor none`

Deferred sibling/spec scope:

- Cache fixes remain owned by `tickets/172POLEVASTA-002.md` through `tickets/172POLEVASTA-005.md`.
- `tickets/172POLEVASTA-006.md` owns flipping this red witness to green and reusing the counters added here for the constructor-no-direct-build invariant.

Same-series draft delta:

- New/active draft siblings opened as context: `172POLEVASTA-002.md`, `172POLEVASTA-003.md`, `172POLEVASTA-004.md`, `172POLEVASTA-005.md`, `172POLEVASTA-006.md`.
- Active-boundary impact: read-only sibling context except `172POLEVASTA-006.md`, whose stale optional-counter wording was corrected to reuse this ticket's counters.

Late-edit proof validity:

- Code and test proof ran before this outcome transcription. A later script edit changed only the `--case arvn-cubes-deep` fixture source from bootstrap GameDef to production GameDef; the affected script smoke was rerun and is recorded above. The later ticket edits record the approved boundary correction, exact proof results, touched-file scope, source-size ledger, and sibling handoff; they do not change runtime semantics, command semantics, acceptance thresholds, or TypeScript code. No-invalidation for the compiled test/determinism lanes: the late script-only fixture-source correction does not affect compiled engine code or the compiled perf witness, and the affected script proof was rerun.
- Dependency-check transcription is clerical: it records the just-run integrity result and does not change scope, acceptance criteria, command semantics, touched-file ownership, or proof claims.
