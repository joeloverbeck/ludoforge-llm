# 149FITLEVNUMVM-019: Phase 4B generic kernel expression/query AOT

**Status**: COMPLETED — Phase 4B kernel expression/query sample reduction landed
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic kernel/CNL expression, condition, query, selector, or filter evaluation paths identified by profiling
**Deps**: `archive/tickets/149FITLEVNUMVM-015.md`, `archive/tickets/149FITLEVNUMVM-018.md`

## Problem

Ticket 016's VM-enabled one-card profile proved the current policy bytecode VM is not the dominant remaining wall-time owner. The captured CPU profile classified about 22.9% of samples under generic kernel expression/query interpretation:

- `resolveRef`
- `evalCondition`
- `evalValue`
- `evalQuery`
- spatial evaluation
- token-filter evaluation

Those surfaces are repeated interpretation of stable declarative `GameDef` / CNL rule data during preview application. They are suitable for a generic AOT or bytecode strategy, but they are not covered by the current policy-expression VM.

## What to Change

1. Reprofile or inspect the Phase 4B profile and identify the exact expression/query families on the one-card path.
2. Design and implement the narrowest generic compiled representation that removes repeated object-walking for the proven hot families.
3. Keep the implementation game-agnostic:
   - no FITL-specific opcodes;
   - no per-game schema;
   - all semantics derived from compiled `GameDef` surfaces.
4. Preserve existing runtime semantics for:
   - reference resolution;
   - condition truthiness and unknown handling;
   - integer-only value evaluation;
   - selector/query ordering;
   - diagnostics where the compiled path rejects or falls back.
5. Add focused correctness tests that compare compiled and existing evaluator results on representative shared fixtures plus at least one FITL production witness.
6. Record baseline/current profile evidence in this ticket's Outcome.

## Files to Touch

- Generic kernel/CNL evaluator modules identified by live profiling, likely under `packages/engine/src/kernel/`
- New generic compiler/AOT helper modules if needed
- Focused tests under `packages/engine/test/unit/` or `packages/engine/test/integration/`
- `archive/tickets/149FITLEVNUMVM-019.md`

## Out of Scope

- Policy-expression VM default flip or closure-tree deletion; ticket 016 owns that.
- Preview token-index copy/lifetime; ticket 020 owns that.
- Preview hashing/verification strategy; ticket 021 owns that.
- Weakening the `<=250 ms` Phase 4 budget.

## Acceptance Criteria

1. Focused compiled-vs-existing correctness tests pass.
2. The one-card profile shows a measured reduction in kernel expression/query samples or wall time, or the Outcome records why this bucket is no longer the active owner.
3. No game-specific branches, opcodes, or schemas are introduced.
4. Any fallback or unsupported path is explicit, measured, and not a compatibility shim that survives into ticket 016's final F14 cut unless another ticket owns its removal.

## Test Plan

1. `pnpm -F @ludoforge/engine build`.
2. Focused tests for the compiled expression/query path.
3. `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-kernel-aot`.

## Outcome

Implemented the narrowest generic AOT slice by routing condition-bearing query and spatial traversal surfaces through the existing cached compiled-condition representation:

- `zones.filter.condition`
- `mapSpaces.filter.condition`
- `tokensInMapSpaces.spaceFilter.condition`
- `nextInOrderByCondition.where`
- free-operation zone-filter probes inside query evaluation
- `connectedZones.via` spatial traversal

No FITL-specific branches, opcodes, schemas, or hardcoded identifiers were added. Unsupported condition shapes still fall back through the existing interpreter via `evaluateConditionWithCache`; this is the existing explicit compiled-condition rejection path, not a new compatibility shim. During TDD, the new query routing exposed a compiler parity bug where empty `and` / `or` conditions compiled to vacuous boolean results instead of preserving the interpreter's `TYPE_MISMATCH` behavior. The compiler now rejects empty boolean combinators so malformed conditions fall through to the interpreter error path.

Baseline profile evidence from ticket 016 / Spec 149:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4-baseline-codex` — RED: `elapsedMs=7101.08`, per-card `elapsedMs=7100.84`, threshold `<=250`.
- CPU-profile classification: kernel expression/query interpretation (`resolveRef`, `evalCondition`, `evalValue`, `evalQuery`, spatial/filter evaluation) was about `22.9%` of samples.

Current profile evidence:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-kernel-aot` — still RED for the overall Phase 4 gate: `elapsedMs=7074.6`, per-card `elapsedMs=7074.37`, threshold `<=250`.
- CPU-profile command: `timeout 180 env LUDOFORGE_POLICY_VM=on node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-149-019-cpu packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-kernel-aot-cpu` — still RED for overall wall time: `elapsedMs=7160.35`, per-card `elapsedMs=7160.13`.
- CPU-profile artifact: `/tmp/ludoforge-149-019-cpu/CPU.20260502.212423.3.0.001.cpuprofile` (ephemeral).
- Parser method: grouped self samples by function/file from the V8 `.cpuprofile`.
- Selected kernel expression/query samples: `1391 / 9094 = 15.30%` across `resolveRef`, `evalCondition`, `evalValue`, `evalQuery`, `eval-query` closures, `evaluateVia`, `queryConnectedZones`, and token-filter compiler frames.

Verdict: ticket 019 reduced the ticket-owned kernel expression/query sample bucket (`about 22.9%` -> `15.30%` by the selected current parser group), but did not materially move the overall one-card wall clock. The remaining red Phase 4 gate is intentionally left to sibling Phase 4B owners: ticket 020 for preview state/token-index lifetime, ticket 021 for preview hashing/canonicalization, and ticket 022 for final same-seam reprofile.

Proof:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/eval-query.test.js` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/condition-compiler.test.js` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/compiled-condition-equivalence.test.js` — PASS.
- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-kernel-aot` — PASS as ticket-owned measurement; RED for the broader Phase 4 `<=250 ms` gate as expected above.
