# 154POLBCDISP-003: Explicit-handler delete-vs-keep decision (D3 deferred-execution, post-recalibration)

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-evaluation-core.ts` (potentially)
**Deps**: `archive/tickets/154POLBCDISP-001.md`, `archive/tickets/154POLBCDISP-002.md`, `archive/tickets/149FITLEVNUMVM-016.md`, `archive/tickets/149FITLEVNUMVM-023.md`

## Problem

PR #239 commit `beb3c3993` added explicit `resolveVmFallbackFeature` handlers for `candidateFeature` (`policy-evaluation-core.ts:701-710`), `stateFeature` (lines 712-721), and `candidateAggregate` (lines 723-732), plus the `findLibraryRef` helper (lines 795-806). With the safety net from `archive/tickets/154POLBCDISP-001.md` and the registry + enumeration test from `archive/tickets/154POLBCDISP-002.md` in place, those handlers become a duplicated fast-path: any unhandled library-ref kind would fall through to the safety-net catch and dispatch to the direct evaluator, which resolves the same library refs via the IR.

Two valid resolutions exist (per spec §D3):

- **Keep them as fast-paths.** Avoids the cost of `evaluateCompiledExprDirect` for the three most common library-ref shapes. For a simple top-level `{ ref: feature.X }` the explicit handler short-circuits to one direct call instead of walking the expression and dispatching via `resolveAgentPolicyRef` → `evaluateCandidateFeature`.
- **Delete them; rely on the safety net.** Architecturally cleaner — dispatch table reads "VM handles X, Y, Z natively; everything else falls back through the safety net". Removes the maintenance burden of keeping `findLibraryRef` in sync with future library refKinds.

The choice depends on a perf measurement against the per-card gate (`test/perf/agents/fitl-per-card-cost.perf.test.ts`). The recalibration prerequisite is now satisfied by `archive/tickets/149FITLEVNUMVM-016.md`: the active gate is the user-approved `<=1800 ms` reset backed by `archive/tickets/150FITLWASM-034.md` and confirmed by ticket 016's final `test:perf` proof.

**Gate condition**: reopened on 2026-05-04 by live reset-gate regression evidence, then unblocked by `archive/tickets/149FITLEVNUMVM-023.md`. `archive/tickets/149FITLEVNUMVM-016.md` historically satisfied the reset prerequisite, but the first current keep-arm preflight samples were red against the `<=1800 ms` gate. Archived ticket `149FITLEVNUMVM-023` classified that as perf-gate harness drift, repaired the checked-in gate to measure the archived reset surface, and proved the gate green again. This ticket is NOT a gate-and-descope ticket; it is ready for the keep-vs-delete measurement.

## Assumption Reassessment (2026-05-04)

1. The three explicit handlers and `findLibraryRef` exist as cited at `packages/engine/src/agents/policy-evaluation-core.ts:701-732` and `:795-806`. Verified via direct read in the reassess-spec session.
2. `archive/tickets/154POLBCDISP-001.md` is sequenced first; the safety-net try/catch must be in place before the perf measurement, otherwise the "delete" arm of the experiment would crash on any unhandled kind that reaches the fallback default. The hot-fix's three handlers also currently mask any latent silent gap in the four `findLibraryRef` accepted refKinds — the safety net is the architectural prerequisite.
3. `archive/tickets/154POLBCDISP-002.md` is sequenced before this ticket so the architectural-invariant test runs against either the keep or delete state and continues to pass — neither arm should regress the dispatch-completeness contract.
4. `findLibraryRef`'s type signature accepts `'candidateFeature' | 'stateFeature' | 'previewStateFeature' | 'aggregate'`. Today no caller passes `'previewStateFeature'` (`featureRefForCompiledPolicyRef` does not emit it — `library:previewStateFeature` refs fall through to `dynamicRef` at `feature-table.ts:249-254`). If "delete" is chosen, `findLibraryRef` and the three case bodies all go together; the `previewStateFeature` slot in the type signature is dead code and disappears with the helper.
5. Reassessment correction: the recalibration of `fitl-per-card-cost.perf.test.ts` already landed through `archive/tickets/149FITLEVNUMVM-016.md`. The live gate's `PHASE4_RESET_CEILING_MS = 1_800` is now the user-approved post-150 reset, not the stale PR #239 buggy-fast-path baseline described by the original Spec 154 draft.
6. Live blocker update: current keep-arm preflight reran the ticket-named perf command three times after a clean engine build and produced red samples `2479.77 ms`, `2461.18 ms`, and `2421.83 ms` (median `2461.18 ms`, `36.7%` over the `1800 ms` ceiling). `archive/tickets/149FITLEVNUMVM-023.md` resolved that contradiction as perf-gate harness drift and repaired the gate.
7. Current prerequisite state: the repaired reset gate passes locally, and the
   Spec 149 reset subtest is green inside `pnpm -F @ludoforge/engine
   test:perf`. The broad perf lane still has an unrelated Spec 145
   preview-pipeline corpus failure. The keep-vs-delete decision may now proceed
   from a truthful keep baseline.

## Architecture Check

1. Both arms preserve the architectural invariant from `archive/tickets/154POLBCDISP-001.md` and `archive/tickets/154POLBCDISP-002.md`: every emitter-produced kind resolves either via the VM, an explicit JS-fallback handler, or the safety-net catch + direct evaluator. The choice between arms is a perf-vs-simplicity tradeoff inside that envelope, not a contract change.
2. Foundation 14 compliance is automatic: whichever arm is chosen, the change is in-place (delete dead code, or keep it as documented fast-path). No `_legacy` shim, no toggle, no rollout switch.
3. Engine-agnostic: `policy-evaluation-core.ts` is part of the universal interpreter; no game-specific identifiers introduced or referenced.
4. The decision criterion is concrete and measurement-driven: if "delete" regresses the recalibrated per-card gate by ≤5% over "keep", prefer "delete" for architectural simplicity; otherwise keep the fast-paths. Document the measurement evidence in the implementing PR's commit body — that record is itself the architectural artifact (Foundation 13: artifact identity).

## What to Change

### 1. Confirm preconditions

- Verify `archive/tickets/154POLBCDISP-001.md` and `archive/tickets/154POLBCDISP-002.md` are landed and the architectural-invariant test passes.
- Verify the perf-gate reset has landed via `archive/tickets/149FITLEVNUMVM-016.md` (`PHASE4_RESET_CEILING_MS = 1_800` in `test/perf/agents/fitl-per-card-cost.perf.test.ts` reflects the user-approved post-150 reset).
- Verify `archive/tickets/149FITLEVNUMVM-023.md` remains completed or archived, and that the repaired reset gate is still green before starting the keep/delete A/B measurements.

### 2. Run the perf measurement

Execute the per-card cost gate twice from a clean checkout:

- **Baseline (keep)**: current state with explicit handlers + `findLibraryRef` in place. Run `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js` (after `pnpm -F @ludoforge/engine build`). Record `elapsedMs` from the test output.
- **Experiment (delete)**: with the three explicit case bodies and `findLibraryRef` removed (see step 3), re-run the same command. Record `elapsedMs`.

Run each arm at least three times to reduce noise; report median.

### 3. Apply the winning resolution

If `delete` regresses by ≤5% relative to `keep` against the recalibrated ceiling:
- Remove the `case 'candidateFeature':` block (`policy-evaluation-core.ts:701-710`).
- Remove the `case 'stateFeature':` block (lines 712-721).
- Remove the `case 'candidateAggregate':` block (lines 723-732).
- Remove the `findLibraryRef` helper (lines 795-806).
- Confirm `pnpm -F @ludoforge/engine typecheck` and `pnpm -F @ludoforge/engine test` pass — the safety-net catch from `archive/tickets/154POLBCDISP-001.md` handles these kinds via the direct evaluator, so behavior is preserved.

If `delete` regresses by >5%:
- Keep the explicit handlers and `findLibraryRef` in place — no source changes in this ticket.
- Add a comment above the three handlers explaining their fast-path role, citing `archive/tickets/154POLBCDISP-001.md` as the safety net they short-circuit and this ticket as the measurement-evidence record. Comment is intentional: future readers should see that the fast-paths are deliberate, not redundant, and that the perf measurement was run.

### 4. Document the measurement evidence

In the implementing PR's commit body (or a co-located `reports/154POLBCDISP-003-measurement.md` if substantial), record:
- Recalibrated ceiling at measurement time
- Median `elapsedMs` for keep arm and delete arm
- Decision and rationale
- Any caveats (e.g., warm/cold cache effects, profile selection)

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify if `delete` wins; modify-with-comment if `keep` wins)

## Out of Scope

- Recalibrating `fitl-per-card-cost.perf.test.ts` ceiling — that landed through `archive/tickets/149FITLEVNUMVM-016.md`. This ticket consumes the reset ceiling, does not produce it.
- Recalibrating `preview-pipeline.perf.test.ts` corpus parameters — same external trail.
- Adding native VM handlers for `candidateFeature` / `stateFeature` / `candidateAggregate` (rejected in spec Brainstorm Context — wrong layer).
- Any change to the `FEATURE_REF_KINDS` registry or the architectural-invariant test from `archive/tickets/154POLBCDISP-002.md` — both arms must keep that test passing without modification.
- Any change to the safety-net catch from `archive/tickets/154POLBCDISP-001.md` — that contract is fixed regardless of which arm wins.

## Acceptance Criteria

### Tests That Must Pass

1. The recalibrated `fitl-per-card-cost.perf.test.ts` passes after applying the winning resolution.
2. `policy-bytecode-fallback-completeness.test.ts` (from `archive/tickets/154POLBCDISP-002.md`) passes — the architectural-invariant holds under either arm.
3. `policy-bytecode-equivalence.test.ts` continues to pass — the equivalence assertion does not depend on which arm is chosen (both produce the same values via different paths).
4. Full engine suite passes: `pnpm -F @ludoforge/engine test`.
5. `slow-parity-shard-b` and `test:performance` lanes stay green.

### Invariants

1. The dispatch contract from `archive/tickets/154POLBCDISP-002.md` continues to hold: every emitter-produced `FeatureRef.kind` resolves without silent `undefined` from `evaluateCompiledExprWithVm`.
2. Replay parity is preserved across the change: same `(GameDef, initial state, seed, actions)` produces an identical canonical state hash before and after, regardless of which arm is chosen.
3. Measurement evidence is recorded — either in the implementing PR's commit body or in a checked-in measurement report. The decision must be auditable.

## Test Plan

### New/Modified Tests

No new tests in this ticket. The architectural-invariant test from `archive/tickets/154POLBCDISP-002.md` is the structural gate; this ticket adjusts the implementation under that invariant based on a perf measurement.

### Commands

1. `pnpm -F @ludoforge/engine build` — confirm clean build before measurement.
2. Baseline measurement (3 runs, median): `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js`.
3. Apply the candidate change (delete arm only — for keep arm skip).
4. Experiment measurement (3 runs, median): same command as step 2.
5. `pnpm -F @ludoforge/engine test` and `pnpm turbo lint` and `pnpm turbo typecheck` — confirm no regression.

## Outcome

Blocked then reopened: 2026-05-04.

This run corrected the stale prerequisite story first: the reset gate did land through `archive/tickets/149FITLEVNUMVM-016.md`, so the earlier PR #239 pending-recalibration wording was no longer truthful. Dependency integrity passed after adding that archived prerequisite.

The current keep-arm baseline then failed the ticket-named perf gate three times after `pnpm -F @ludoforge/engine build`:

- `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js` — RED, `elapsedMs=2479.77`, `ceilingMs=1800`.
- Same command — RED, `elapsedMs=2461.18`, `ceilingMs=1800`.
- Same command — RED, `elapsedMs=2421.83`, `ceilingMs=1800`.

Median keep-arm baseline: `2461.18 ms`, `661.18 ms` over the reset ceiling (`36.7%` red).

Decision at that time: do not run the delete-arm experiment or modify `packages/engine/src/agents/policy-evaluation-core.ts` while the keep baseline fails the reset gate. `archive/tickets/149FITLEVNUMVM-023.md` owned revalidating or repairing that gate. This ticket was blocked at that point, with no runtime source changes retained.

Follow-up update: `archive/tickets/149FITLEVNUMVM-023.md` repaired the reset perf gate
as harness drift and proved it green. This ticket is no longer blocked by the
reset prerequisite; its own keep-vs-delete measurement remains unstarted.

Verification and graph checks:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm run check:ticket-deps` — PASS before adding the new blocker dependency.
- `pnpm run check:ticket-deps` — PASS after adding `archive/tickets/149FITLEVNUMVM-023.md` and rewiring the active dependents; checked 3 active tickets and 2229 archived tickets.
