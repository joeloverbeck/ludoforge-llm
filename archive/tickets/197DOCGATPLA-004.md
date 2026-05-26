# 197DOCGATPLA-004: Cross-profile architectural-invariant tests + golden trace

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/197DOCGATPLA-001.md`, `archive/tickets/197DOCGATPLA-002.md`, `archive/tickets/197DOCGATPLA-003.md`

## Problem

Tickets 001-003 ship the gating feature plus per-shape unit tests and a FITL-specific convergence witness. Spec §7 P4 calls for a *cross-profile property test* asserting that gating semantics hold across any active strategy module with `enablesPlanTemplates` / `suppressesPlanTemplates` — not only the FITL slice. This ticket adds the synthesized-profile architectural-invariant corpus plus a golden trace pinning the new `filteredOutTemplates` shape, completing the F#16 testing-as-proof obligation for the spec.

## Assumption Reassessment (2026-05-26)

1. The synthesized-profile pattern is established in the codebase; see `packages/engine/test/unit/agents/plan-proposal.test.ts` and related fixtures for the existing approach to constructing minimal profiles.
2. Golden traces for plan-proposal output live under `packages/engine/test/determinism/`; precedent at `plan-trace-replay.test.ts` and `plan-semantic-correspondence-golden.test.ts`.
3. The `filteredOutTemplates` trace field is added by 002; this ticket pins its byte-identical serialization shape via golden trace.
4. The per-shape unit tests in 002 (`plan-proposer-eligibility-filter.test.ts`) cover individual filter shapes against minimal fixtures. This ticket covers the property assertion across *profile variants* — a stronger property that no single shape-specific test captures.
5. Test class taxonomy per `.claude/rules/testing.md`: synthesized-profile property tests are `architectural-invariant`; golden traces are `golden-trace`. Each new test file declares exactly one class marker.

## Architecture Check

1. **Property-form assertions over corpus, not single trajectories**: The architectural-invariant tests assert properties that must hold across *any* legitimate profile — "any active module with `enablesPlanTemplates` field restricts the candidate set", "suppress beats enable across all profile variants", "empty-eligibility falls through cleanly to `noEligibleTemplate`". These distill the FITL-specific witness from 003 into a general property, complementing rather than duplicating it.
2. **Determinism proof via golden trace (F#8, F#16)**: A golden trace pinning the `filteredOutTemplates` shape for a known synthesized profile provides byte-exact replay evidence. This is the determinism-corpus complement to the cross-profile property test.
3. **No engine changes**: Ticket is purely test scaffolding consuming the production behavior from 001-002. Architectural exposure is zero.
4. **Foundation 20 alignment proof**: Golden trace confirms the `{ templateId, gatedBy, reason }` provenance shape is preserved across serialization — explicit non-coerced provenance per F#20.

## What to Change

### 1. Cross-profile architectural-invariant test

New file: `packages/engine/test/architecture/doctrine-gating-eligibility.test.ts`. Marker:

```ts
// @test-class: architectural-invariant
```

Three synthesized profiles exercise the filter shapes:

- **Profile A (enables-only)**: 3 templates (X, Y, Z), 1 strategy module with `enablesPlanTemplates: [X, Y]`, active. Asserts `eligible = [X, Y]`, `filteredOutTemplates = [{ templateId: Z, gatedBy: [moduleA], reason: 'notEnabled' }]`.
- **Profile B (suppress-only)**: 3 templates, 1 module with `suppressesPlanTemplates: [Z]`, active. Asserts `eligible = [X, Y]`, `filteredOutTemplates = [{ templateId: Z, gatedBy: [moduleB], reason: 'suppressed' }]`.
- **Profile C (enables+suppress union, suppress wins)**: 3 templates; module A enables [X, Y], module B suppresses [Y], both active. Asserts `eligible = [X]`, `filteredOutTemplates` includes Y with `reason: 'suppressed'` (not `'notEnabled'`) and Z with `reason: 'notEnabled'`.
- **Profile D (empty result)**: 3 templates; module A enables [X], module B suppresses [X], both active. Asserts `eligible = []` and the proposer returns `status: 'noEligibleTemplate'`. Scalar fallback would take over downstream (out of scope for this test).

Each profile is a minimal `CompiledAgentProfile` constructed via existing test helpers (e.g., the strategy-module test fixtures at `packages/engine/test/unit/agents/strategy-module-test-fixtures.ts`).

### 2. Golden trace for `filteredOutTemplates` shape

New file: `packages/engine/test/determinism/plan-trace-doctrine-gating-golden.test.ts`. Marker:

```ts
// @test-class: golden-trace
```

Pins the byte-exact serialized trace output for one of the synthesized profiles above (Profile C is the richest — exercises both `reason` values and multi-module `gatedBy`). The fixture lives under `packages/engine/test/fixtures/plan-trace-doctrine-gating-golden.json` (or similar — implementer follows the existing fixture-naming convention from `plan-semantic-correspondence-golden.test.ts`).

The fixture is pinned: re-blessing requires the commit body to name the spec change forcing the re-bless per `.claude/rules/testing.md` `golden-trace` discipline.

### 3. Determinism corpus integration

Confirm the new tests run as part of `pnpm -F @ludoforge/engine test:e2e` and / or the determinism corpus per `packages/engine/test/determinism/` conventions. The golden trace test specifically attaches to the existing determinism lane.

## Files to Touch

- `packages/engine/test/architecture/doctrine-gating-eligibility.test.ts` (new — cross-profile property assertions)
- `packages/engine/test/determinism/plan-trace-doctrine-gating-golden.test.ts` (new — pinned trace shape)
- `packages/engine/test/fixtures/trace/plan-trace-doctrine-gating.golden.json` (new — pinned fixture)

## Implementation Outcome (2026-05-26)

- Added a shared synthesized-profile fixture helper for doctrine-gating proposal tests.
- Added the architectural-invariant corpus for enables-only, suppress-only, suppression-over-enable, empty eligibility, and non-empty `gatedBy` provenance.
- Added a golden trace test plus pinned fixture for the richest doctrine-gating trace shape, covering both `suppressed` and `notEnabled` filtered-template reasons.
- Kept the proof engine-agnostic: these tests assert generic proposal semantics and deterministic trace serialization; FITL profile-quality behavior remains owned by 003.

Source-size ledger:

- `packages/engine/test/helpers/doctrine-gating-fixtures.ts`: 193 lines.
- `packages/engine/test/architecture/doctrine-gating-eligibility.test.ts`: 86 lines.
- `packages/engine/test/determinism/plan-trace-doctrine-gating-golden.test.ts`: 30 lines.
- `packages/engine/test/fixtures/trace/plan-trace-doctrine-gating.golden.json`: 52 lines.

## Out of Scope

- FITL-specific witness (`buildPoliticalEngine` active/inactive) — owned by 003.
- Compile-time error corpus tests — owned by 001.
- Per-shape filter unit tests (default-permissive, suppress-only, enables-only individual cases against minimal fixtures) — owned by 002. This ticket covers the same shapes via *profile-variant property assertion*, which is structurally distinct: synthesized profiles, asserted as a property that holds across the variant set, marked `architectural-invariant`.
- Performance benchmarks for the filter — uncommitted; spec does not require.

## Acceptance Criteria

### Tests That Must Pass

1. **Profile A (enables-only)**: synthesized profile produces the expected `eligible` set and `filteredOutTemplates` shape per §What to Change.1.
2. **Profile B (suppress-only)**: synthesized profile produces the expected output.
3. **Profile C (enables+suppress union, suppress wins)**: synthesized profile asserts suppress wins; `reason` for Y is `'suppressed'` not `'notEnabled'`.
4. **Profile D (empty result)**: synthesized profile produces empty `eligible` and `status: 'noEligibleTemplate'`.
5. **Golden trace**: serialized trace for Profile C is byte-identical to the pinned fixture.
6. Existing engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. **Filter property generality (F#16)**: The architectural invariants hold for *any* legitimate profile, not just the synthesized variants — the synthesized set is the witness sample, the assertion is the universal property.
2. **Golden trace stability (F#8)**: Building twice produces byte-identical golden trace.
3. **Provenance completeness (F#20)**: Every `filteredOutTemplates` entry in every test case carries non-empty `gatedBy`. No silent provenance coercion.
4. **Test class purity**: `architecture/doctrine-gating-eligibility.test.ts` carries `// @test-class: architectural-invariant` exclusively; `determinism/plan-trace-doctrine-gating-golden.test.ts` carries `// @test-class: golden-trace` exclusively. Re-blessing the golden trace requires commit-body documentation per `.claude/rules/testing.md`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/doctrine-gating-eligibility.test.ts` (new) — covers acceptance 1-4. Test class: `architectural-invariant`.
2. `packages/engine/test/determinism/plan-trace-doctrine-gating-golden.test.ts` (new) — covers acceptance 5. Test class: `golden-trace`.
3. `packages/engine/test/fixtures/trace/plan-trace-doctrine-gating.golden.json` (new) — pinned fixture consumed by the golden test.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/architecture/doctrine-gating-eligibility.test.js`
2. `node --test packages/engine/dist/test/determinism/plan-trace-doctrine-gating-golden.test.js`
3. `pnpm -F @ludoforge/engine test:e2e` (confirm determinism lane includes new golden trace)
4. `pnpm turbo lint typecheck test`

### Verification Run

Passed:

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/architecture/doctrine-gating-eligibility.test.js`
3. `node --test packages/engine/dist/test/determinism/plan-trace-doctrine-gating-golden.test.js`
4. `pnpm -F @ludoforge/engine test:e2e` (6/6 files passed)
5. `pnpm -F @ludoforge/engine test` (172/172 files passed)
6. `pnpm turbo lint typecheck test` (9/9 tasks passed)
7. `pnpm run check:ticket-deps`
8. `git diff --check`
