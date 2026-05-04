# 154POLBCDISP-003: Explicit-handler delete-vs-keep decision (D3 deferred-execution, post-recalibration)

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-evaluation-core.ts` (potentially)
**Deps**: `archive/tickets/154POLBCDISP-001.md`, `tickets/154POLBCDISP-002.md`

## Problem

PR #239 commit `beb3c3993` added explicit `resolveVmFallbackFeature` handlers for `candidateFeature` (`policy-evaluation-core.ts:701-710`), `stateFeature` (lines 712-721), and `candidateAggregate` (lines 723-732), plus the `findLibraryRef` helper (lines 795-806). With the safety net from `archive/tickets/154POLBCDISP-001.md` and the registry + enumeration test from `tickets/154POLBCDISP-002.md` in place, those handlers become a duplicated fast-path: any unhandled library-ref kind would fall through to the safety-net catch and dispatch to the direct evaluator, which resolves the same library refs via the IR.

Two valid resolutions exist (per spec §D3):

- **Keep them as fast-paths.** Avoids the cost of `evaluateCompiledExprDirect` for the three most common library-ref shapes. For a simple top-level `{ ref: feature.X }` the explicit handler short-circuits to one direct call instead of walking the expression and dispatching via `resolveAgentPolicyRef` → `evaluateCandidateFeature`.
- **Delete them; rely on the safety net.** Architecturally cleaner — dispatch table reads "VM handles X, Y, Z natively; everything else falls back through the safety net". Removes the maintenance burden of keeping `findLibraryRef` in sync with future library refKinds.

The choice depends on a perf measurement against the per-card gate (`test/perf/agents/fitl-per-card-cost.perf.test.ts`). That gate is itself pending recalibration as part of PR #239's follow-up — the current 1800 ms ceiling (`PHASE4_RESET_CEILING_MS`, line 37) was calibrated against the buggy fast path.

**Gate condition** (deferred-execution): this ticket's execution waits on PR #239's perf-gate recalibration landing in main. Once the recalibrated `fitl-per-card-cost.perf.test.ts` ceiling is in place, run the perf measurement and apply the winning resolution. This ticket is unconditionally executed once its upstream deps + the external recalibration close — it is NOT a gate-and-descope ticket; the work always happens.

## Assumption Reassessment (2026-05-04)

1. The three explicit handlers and `findLibraryRef` exist as cited at `packages/engine/src/agents/policy-evaluation-core.ts:701-732` and `:795-806`. Verified via direct read in the reassess-spec session.
2. `archive/tickets/154POLBCDISP-001.md` is sequenced first; the safety-net try/catch must be in place before the perf measurement, otherwise the "delete" arm of the experiment would crash on any unhandled kind that reaches the fallback default. The hot-fix's three handlers also currently mask any latent silent gap in the four `findLibraryRef` accepted refKinds — the safety net is the architectural prerequisite.
3. `tickets/154POLBCDISP-002.md` is sequenced before this ticket so the architectural-invariant test runs against either the keep or delete state and continues to pass — neither arm should regress the dispatch-completeness contract.
4. `findLibraryRef`'s type signature accepts `'candidateFeature' | 'stateFeature' | 'previewStateFeature' | 'aggregate'`. Today no caller passes `'previewStateFeature'` (`featureRefForCompiledPolicyRef` does not emit it — `library:previewStateFeature` refs fall through to `dynamicRef` at `feature-table.ts:249-254`). If "delete" is chosen, `findLibraryRef` and the three case bodies all go together; the `previewStateFeature` slot in the type signature is dead code and disappears with the helper.
5. The recalibration of `fitl-per-card-cost.perf.test.ts` is NOT a deliverable of this spec or this namespace — it lives in PR #239's follow-up trail. Treat its landing as an external precondition, not a sibling ticket.

## Architecture Check

1. Both arms preserve the architectural invariant from `archive/tickets/154POLBCDISP-001.md` and `tickets/154POLBCDISP-002.md`: every emitter-produced kind resolves either via the VM, an explicit JS-fallback handler, or the safety-net catch + direct evaluator. The choice between arms is a perf-vs-simplicity tradeoff inside that envelope, not a contract change.
2. Foundation 14 compliance is automatic: whichever arm is chosen, the change is in-place (delete dead code, or keep it as documented fast-path). No `_legacy` shim, no toggle, no rollout switch.
3. Engine-agnostic: `policy-evaluation-core.ts` is part of the universal interpreter; no game-specific identifiers introduced or referenced.
4. The decision criterion is concrete and measurement-driven: if "delete" regresses the recalibrated per-card gate by ≤5% over "keep", prefer "delete" for architectural simplicity; otherwise keep the fast-paths. Document the measurement evidence in the implementing PR's commit body — that record is itself the architectural artifact (Foundation 13: artifact identity).

## What to Change

### 1. Confirm preconditions

- Verify `archive/tickets/154POLBCDISP-001.md` and `tickets/154POLBCDISP-002.md` are landed and the architectural-invariant test passes.
- Verify PR #239's perf-gate recalibration has landed (`PHASE4_RESET_CEILING_MS` in `test/perf/agents/fitl-per-card-cost.perf.test.ts` reflects the post-fix ceiling, not the buggy 1800 ms baseline).

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

- Recalibrating `fitl-per-card-cost.perf.test.ts` ceiling — that's PR #239's follow-up trail, not this ticket. This ticket consumes the recalibrated ceiling, does not produce it.
- Recalibrating `preview-pipeline.perf.test.ts` corpus parameters — same external trail.
- Adding native VM handlers for `candidateFeature` / `stateFeature` / `candidateAggregate` (rejected in spec Brainstorm Context — wrong layer).
- Any change to the `FEATURE_REF_KINDS` registry or the architectural-invariant test from `tickets/154POLBCDISP-002.md` — both arms must keep that test passing without modification.
- Any change to the safety-net catch from `archive/tickets/154POLBCDISP-001.md` — that contract is fixed regardless of which arm wins.

## Acceptance Criteria

### Tests That Must Pass

1. The recalibrated `fitl-per-card-cost.perf.test.ts` passes after applying the winning resolution.
2. `policy-bytecode-fallback-completeness.test.ts` (from `tickets/154POLBCDISP-002.md`) passes — the architectural-invariant holds under either arm.
3. `policy-bytecode-equivalence.test.ts` continues to pass — the equivalence assertion does not depend on which arm is chosen (both produce the same values via different paths).
4. Full engine suite passes: `pnpm -F @ludoforge/engine test`.
5. `slow-parity-shard-b` and `test:performance` lanes stay green.

### Invariants

1. The dispatch contract from `tickets/154POLBCDISP-002.md` continues to hold: every emitter-produced `FeatureRef.kind` resolves without silent `undefined` from `evaluateCompiledExprWithVm`.
2. Replay parity is preserved across the change: same `(GameDef, initial state, seed, actions)` produces an identical canonical state hash before and after, regardless of which arm is chosen.
3. Measurement evidence is recorded — either in the implementing PR's commit body or in a checked-in measurement report. The decision must be auditable.

## Test Plan

### New/Modified Tests

No new tests in this ticket. The architectural-invariant test from `tickets/154POLBCDISP-002.md` is the structural gate; this ticket adjusts the implementation under that invariant based on a perf measurement.

### Commands

1. `pnpm -F @ludoforge/engine build` — confirm clean build before measurement.
2. Baseline measurement (3 runs, median): `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/fitl-per-card-cost.perf.test.js`.
3. Apply the candidate change (delete arm only — for keep arm skip).
4. Experiment measurement (3 runs, median): same command as step 2.
5. `pnpm -F @ludoforge/engine test` and `pnpm turbo lint` and `pnpm turbo typecheck` — confirm no regression.
