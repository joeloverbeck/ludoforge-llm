# ARCHTRACE-004: Normalize Trace Semantics + Add Trace Contract Tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — semantics and contract tests
**Deps**: ARCHTRACE-002, ARCHTRACE-003

## Reassessed Assumptions (Code/Test Reality Check)

Validated against current `src/kernel` and `test/`:

1. Provenance metadata is already implemented and tested (for example in `test/unit/apply-move.test.ts` and `test/unit/execution-trace.test.ts`), so provenance is not a missing capability.
2. `transferVar` already has dedicated trace tests and explicitly skips no-op trace emission (`test/unit/resource-transfer-trace.test.ts`).
3. `setVar` already skips no-op trace emission by returning early before `emitTrace`.
4. `addVar` is currently inconsistent: it emits `varChange` trace before the no-op check in both global and per-player paths (`src/kernel/effects-var.ts`).
5. Deterministic replay/ordering checks already exist in broad integration/unit coverage, but there is no dedicated trace-semantics contract suite focused on no-op policy parity across effect families.

## What Needs To Change / Be Implemented

Define and enforce one explicit no-op trace policy and codify it with dedicated contract tests.

Current inconsistency to fix:
- `addVar` emits `varChange` trace entries for no-op/clamped-no-op outcomes while `setVar` and `transferVar` do not emit no-op trace entries.

Required implementation:
1. Adopt one global no-op trace rule for state-mutation entries: emit only when state changes.
2. Apply that rule to `addVar` to align it with existing `setVar` and `transferVar` behavior.
3. Add a dedicated trace contract test suite that locks down the policy and key trace invariants.
4. Keep effect tracing game-agnostic (no game-specific branches or payload assumptions).

Deferred/non-goals for this ticket:
- Broad cross-handler refactors beyond the identified `addVar` inconsistency.
- New trace entry kinds or schema redesign.
- Game-specific trace semantics.

## Architectural Direction

Preferred direction:
1. State-mutating trace entries represent realized mutations only; no-op attempts should remain observable via warnings/inputs, not mutation trace payloads.
2. Contract tests should live in one dedicated suite so future handler additions cannot drift semantics silently.
3. Keep semantics generic and stable for all GameSpecDoc-compiled games.

Why this is more beneficial than current architecture:
- The current mixed policy (`setVar`/`transferVar` skip no-ops, `addVar` emits no-ops) creates consumer ambiguity and brittle assumptions for replay/animation/diagnostics tooling.
- A unified mutation-only trace policy is simpler, easier to reason about, and more extensible as new effect handlers are introduced.

Dedicated contract suite validates:
- no-op handling
- ordering guarantees
- provenance presence
- transfer/varChange coherence

## Invariants That Should Pass

1. `setVar`, `addVar`, and `transferVar` all follow the same no-op mutation trace policy.
2. Trace ordering is deterministic for identical seed + move stream.
3. Trace entries remain game-agnostic and usable across arbitrary GameSpecDoc games.
4. Contract tests fail if a future effect handler violates trace semantics.

## Tests That Should Pass

1. Unit contract test: no-op `setVar` and no-op `addVar` obey the same no-op trace policy.
2. Unit contract test: no-op `transferVar` emits neither `resourceTransfer` nor `varChange`.
3. Unit contract test: trace ordering deterministic under replay for identical input.
4. Unit contract test: provenance is present on contract-covered trace entries.
5. Unit contract test: `resourceTransfer` and paired `varChange` deltas remain coherent.
6. Regression: `npm test` and `npm run lint` pass.

## Outcome

- Completion date: 2026-02-17
- What was actually changed:
1. Corrected `addVar` trace semantics in `src/kernel/effects-var.ts` so `varChange` trace entries are emitted only when a state mutation occurs (global and per-player paths).
2. Added `test/unit/trace-contract.test.ts` as a dedicated trace contract suite covering:
- no-op policy parity across `setVar`/`addVar`/`transferVar`
- deterministic trace ordering under identical seed + move stream
- provenance presence on contract-covered entries
- `resourceTransfer` and paired `varChange` delta coherence
3. Centralized mutation trace emission policy into `src/kernel/var-change-trace.ts` and migrated `effects-var` + `effects-resource` to the shared helper so no-op trace behavior cannot drift across handlers.
4. Reassessed and updated this ticket’s assumptions/scope before implementation to match current repository reality.
- Deviations from original plan:
1. Removed `commitResource` from scope because no such effect handler exists in the current codebase; `transferVar` is the relevant resource transfer primitive.
2. Did not add new docs/spec notes in this ticket because provenance + trace behavior docs/tests already exist and the remaining gap was implementation parity + contract coverage.
- Verification results:
1. `npm test` passed.
2. `npm run lint` passed.
