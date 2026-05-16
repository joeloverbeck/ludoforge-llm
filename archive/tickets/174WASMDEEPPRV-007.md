# 174WASMDEEPPRV-007: Phase 2 — TS/WASM preview-drive parity oracle

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new integration test
**Deps**: `archive/tickets/174WASMDEEPPRV-002.md`, `archive/tickets/174WASMDEEPPRV-003.md`, `archive/tickets/174WASMDEEPPRV-004.md`, `archive/tickets/174WASMDEEPPRV-005.md`, `archive/tickets/174WASMDEEPPRV-006.md`

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

## Outcome

Completed on 2026-05-16.

Implemented the Phase 2 sibling integration oracle:

1. Added `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` with `@test-class: architectural-invariant`.
2. Added `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` with generic synthetic preview-drive fixtures; no FITL identifiers are used.
3. The supported-row oracle compares TypeScript preview-runtime output against the WASM production preview-drive path for candidate ordering, ready outcome/status, preview-state values, candidate grouping metadata, F#20 signal carriers, decision-stack publication, continued-deepening completion records, and a deterministic normalized row digest.
4. The unsupported-row oracle compares the TypeScript synthetic fail-closed oracle against the WASM runtime unsupported result for the stable `unsupported preview-drive class <class>` reason shape.

Boundary corrections:

1. The draft names private TypeScript helper internals (`continueChooseNStepInnerPreviewDrive` / `driveSyntheticCompletion`) as the TS oracle path. The live public seam that exercises the same TS preview-drive behavior is `createPolicyPreviewRuntime(...).getPreviewState(...)`; the test uses that public seam rather than exporting private helpers for test-only access.
2. Production route activation remains explicitly out of scope and deferred to `tickets/174WASMDEEPPRV-008.md`. This ticket directly invokes the existing WASM preview-drive runtime/bridge as the Phase 2 parity proof.
3. Deterministic hashes are represented by a normalized row digest for the compared preview-drive row projection plus the TypeScript preview-state hash as diagnostic evidence; the WASM row shape does not carry a serialized `GameState` hash.

Generated fallout: none expected. No schema, GameDef, trace-schema, golden, Rust, ABI, or production routing artifact changed.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
|---|---:|---:|---|---|---|---|
| `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` | 0 | 307 | no | new helper | within repo guidance; no split needed | none |
| `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` | 0 | 57 | no | new test | within repo guidance | none |

Verification:

1. RED: `node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-equivalence.test.js` failed before the digest-oracle fix because the TS fixture hashed its placeholder digest field while the WASM projection did not.
2. `pnpm -F @ludoforge/engine build` — passed.
3. `node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-equivalence.test.js` — passed after the oracle fix; 2 tests passed.
4. `pnpm -F @ludoforge/engine test:determinism` — passed; `23/23` files passed.
5. `pnpm turbo build` — passed; `3/3` tasks passed. `@ludoforge/engine-wasm#build` replayed from cache as supplemental because this ticket changed only TypeScript tests. Runner emitted the existing Vite chunk-size advisory, classified non-ticket-owned.
6. `pnpm turbo test` — passed; `5/5` tasks passed, engine default lane reported `82/82` files passed, and runner tests passed. Cached build prerequisites replayed from the immediately preceding build; engine and runner test tasks executed. Runner emitted existing jsdom canvas/crash-recovery stderr advisories, classified non-ticket-owned.
7. `pnpm turbo lint` — passed; `2/2` tasks passed. Runner lint replayed from cache as supplemental; engine lint executed.
8. `pnpm turbo typecheck` — passed; `3/3` tasks passed. Engine build replayed from cache as a prerequisite; engine and runner typechecks executed.
9. Final focused compiled-output rerun: `node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-equivalence.test.js` — passed after the broad lanes; 2 tests passed.
10. `pnpm run check:ticket-deps` — passed for 4 active tickets and 2357 archived tickets.

Late-edit proof validity: terminal status, exact proof transcription, and dependency-check result transcription only; no scope, acceptance criteria, command semantics, touched-file ownership, dependency ownership, or follow-up ownership changed after the final proof set. No code proof rerun or second dependency-check rerun is required for this closeout edit.
