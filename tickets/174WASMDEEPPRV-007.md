# 174WASMDEEPPRV-007: Phase 2 — TS/WASM preview-drive parity oracle

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new integration test
**Deps**: `archive/tickets/174WASMDEEPPRV-002.md`, `archive/tickets/174WASMDEEPPRV-003.md`, `tickets/174WASMDEEPPRV-004.md`, `tickets/174WASMDEEPPRV-005.md`, `tickets/174WASMDEEPPRV-006.md`

## Problem

Spec 174 Acceptance Criterion #2 requires a TypeScript oracle proving byte-equivalent candidate ordering, preview status, surfaced values, and deterministic hashes between the TS and WASM preview-drive paths for every supported row. Existing parity tests (`policy-bytecode-equivalence.test.ts`, `policy-bytecode-equivalence-partial-visibility.test.ts`) prove score-row parity only — they do NOT cover preview-drive output parity. After Phase 1 ABI extensions (002–006) land, this ticket builds the missing oracle as a new sibling integration test, satisfying AC #2 and gating Phase 3 activation (ticket 008).

## Assumption Reassessment (2026-05-15)

1. Confirmed `policy-bytecode-equivalence.test.ts` and `policy-bytecode-equivalence-partial-visibility.test.ts` carry `@test-class: architectural-invariant` and prove score-row parity via `evaluateWasmMoveConsiderationScoreRows`.
2. Confirmed there is no existing preview-drive parity oracle that covers candidate ordering, preview status, surfaced values, or deterministic hashes.
3. Tickets 002–006 collectively close every Phase 0 ABI gap; this ticket exercises that completed surface.

## Architecture Check

1. AC #2 cannot be satisfied without this oracle — it is the proof gate Phase 3 activation depends on.
2. Engine-agnostic (F#1): fixtures and oracle assertions use generic preview-drive input data; no FITL identifiers.
3. Testing as proof (F#16): byte-equivalence is asserted rather than approximated.
4. Sibling-not-extension (per spec §4 Phase 2 row): the new oracle is a new integration test file, not an extension of `policy-bytecode-equivalence*.test.ts` — score-row parity and preview-drive parity prove different boundary contracts.

## What to Change

### 1. New integration parity oracle

`packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` (`@test-class: architectural-invariant`):
- For each supported preview-drive class enumerated in the 174 Phase 0 inventory (ticket 001 deliverable):
  - Build a synthetic preview-drive input that exercises the relevant ABI surface (signal carriers / decision-stack publication / preview-state slots / candidate grouping / completion semantics).
  - Evaluate via the TS path (`continueChooseNStepInnerPreviewDrive` → `driveSyntheticCompletion` from `policy-preview-inner-deepening.ts`).
  - Evaluate via the WASM path (`evaluateProductionPreviewDriveBatchWithWasm` from `policy-wasm-production-preview-drive.ts`).
  - Assert byte-equivalence: preview outcomes, candidate ordering, state-feature values, F#20 signal carriers, deterministic hashes where applicable.
- For unsupported classes (still outside Phase 1's scope), assert fail-closed parity — both paths emit stable reason strings.

### 2. Fixtures helper

`packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` (new): generic synthetic preview-drive fixtures parameterised by class. No FITL identifiers.

## Files to Touch

- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` (new)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` (new)

## Out of Scope

- No production route activation (ticket 008).
- No ABI work — this ticket consumes the ABI surfaces shipped in 002–006.
- No FITL-specific identifiers in fixtures or assertions.

## Acceptance Criteria

### Tests That Must Pass

1. New parity oracle test passes for every supported class enumerated in the Phase 0 inventory.
2. Engine suite green: `pnpm turbo build && pnpm turbo test`.
3. Determinism gates green (same list as ticket 002).

### Invariants

1. Byte-equivalence across TS and WASM for: candidate ordering, preview status, state-feature values, F#20 signal carriers, deterministic hashes.
2. Fail-closed parity: unsupported classes emit identical stable reason strings on both paths.
3. No FITL identifiers in fixtures.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` — new parity oracle.
2. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` — generic fixtures helper.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-equivalence.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
