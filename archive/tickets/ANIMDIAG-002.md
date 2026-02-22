# ANIMDIAG-002: Diagnostic Ring Buffer

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-001

## Problem

Animation diagnostic data needs to be buffered in memory so it can be exported on demand. An unbounded log would grow indefinitely during long sessions. A ring buffer capped at N batches (~1-2 minutes of gameplay) provides full recent history without memory growth. This buffer is the central storage that the logger writes to and the UI reads from.

## Assumption Reassessment (2026-02-22)

1. No existing diagnostic buffer exists in `packages/runner/src/animation/` — confirmed, this is a new file.
2. `DiagnosticBatch` and all entry types are available from ANIMDIAG-001 in `packages/runner/src/animation/animation-diagnostics.ts`.
3. Runner tests execute in a Node environment (`packages/runner/vitest.config.ts` sets `environment: 'node'`). Download behavior must therefore be environment-safe and testable without assuming DOM globals always exist.

## Architecture Check

1. A dedicated `diagnostic-buffer.ts` module is cleaner than embedding buffer logic in the logger — separation of concerns between storage and logging.
2. Ring buffer pattern (overwrite oldest when full) is the right choice over unbounded array or LRU — simple, predictable memory, no eviction policy complexity.
3. To keep architecture robust and testable, browser-dependent download concerns should be abstracted behind a small runtime adapter used by `downloadAsJson()`. The default adapter can use browser APIs; tests can inject stubs.
4. No backwards-compatibility concerns — entirely new module.

## What to Change

### 1. Create `diagnostic-buffer.ts`

New file at `packages/runner/src/animation/diagnostic-buffer.ts`.

**`DiagnosticBuffer` interface**:
- `readonly maxBatches: number` — capacity (default 100)
- `beginBatch(isSetup: boolean): void` — starts a new mutable accumulator
- Stage-specific recording methods: `recordTrace()`, `recordDescriptors()`, `recordSpriteResolution()`, `recordEphemeralCreated()`, `recordTween()`, `recordFaceControllerCall()`, `recordTokenVisibilityInit()`, `recordQueueEvent()`, `recordWarning()`
- `endBatch(): void` — freezes the accumulator and appends to the ring buffer (drops oldest if at capacity)
- `getBatches(): readonly DiagnosticBatch[]` — returns all stored batches
- `downloadAsJson(): void` — triggers a browser file download when runtime download APIs are available; otherwise no-op
- `clear(): void` — empties the buffer

**`createDiagnosticBuffer(maxBatches?: number, runtime?: DiagnosticBufferRuntime): DiagnosticBuffer`** factory function.

**`DiagnosticBufferRuntime`**:
- Small adapter interface for download side effects (blob creation, object URL lifecycle, anchor click).
- Default implementation uses browser globals when available.

### 2. Implement ring buffer internals

- Internal mutable array of `DiagnosticBatch`, capped at `maxBatches`.
- `beginBatch()` creates a mutable accumulator object. Calling `beginBatch()` while one is open should `endBatch()` the previous one first (defensive).
- Auto-incrementing `batchId` counter.
- `endBatch()` freezes the accumulator into a `DiagnosticBatch` and pushes to the ring buffer. If length exceeds `maxBatches`, shift the oldest entry.

### 3. Implement `downloadAsJson()`

- Serialize `getBatches()` with a `meta` header containing: `{ exportedAt: ISO string, batchCount: number, oldestBatchId: number, newestBatchId: number }`.
- Create JSON payload and invoke runtime adapter download.
- Generate filename: `anim-diagnostic-${ISO timestamp}.json` (colons replaced with dashes for filesystem safety).

## Files to Touch

- `packages/runner/src/animation/diagnostic-buffer.ts` (new)
- `packages/runner/src/animation/index.ts` (modify export)
- `packages/runner/test/animation/diagnostic-buffer.test.ts` (new)

## Out of Scope

- Logger integration (ANIMDIAG-003)
- Controller wiring (ANIMDIAG-006)
- UI download button (ANIMDIAG-007)

## Acceptance Criteria

### Tests That Must Pass

1. **Lifecycle**: `beginBatch()` → multiple `record*()` calls → `endBatch()` → `getBatches()` returns 1 batch with correct data.
2. **Ring buffer cap**: Fill buffer beyond `maxBatches`, verify `getBatches().length === maxBatches` and oldest batch was dropped.
3. **Clear**: After `clear()`, `getBatches()` returns empty array.
4. **Download payload**: Serialized content is valid JSON with correct `meta` header and batch data.
5. **Download runtime call**: Download adapter is invoked with expected filename/content type when available.
6. **Empty batch**: `beginBatch()` → `endBatch()` with no records produces a batch with empty arrays.
7. **Auto-incrementing batchId**: Each batch gets a unique incrementing ID.
8. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Buffer length never exceeds `maxBatches`.
2. `getBatches()` returns immutable data — callers cannot mutate internal state.
3. `downloadAsJson()` always produces parseable JSON payload and is safe when download runtime is unavailable.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/diagnostic-buffer.test.ts` — full unit test suite covering lifecycle, ring buffer eviction, clear, download payload/runtime, empty batch, and batchId sequencing.

### Commands

1. `pnpm -F @ludoforge/runner test -- diagnostic-buffer`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-22
- What changed:
  - Added `packages/runner/src/animation/diagnostic-buffer.ts` with:
    - `DiagnosticBuffer` + `createDiagnosticBuffer()`
    - Ring-buffer storage with fixed-capacity eviction
    - Batch lifecycle (`beginBatch`/`endBatch`) plus stage record APIs
    - Immutable stored snapshots via clone + deep freeze
    - `downloadAsJson()` export pipeline with metadata
    - `DiagnosticBufferRuntime` adapter for download side effects
  - Exported buffer module from `packages/runner/src/animation/index.ts`.
  - Added `packages/runner/test/animation/diagnostic-buffer.test.ts` covering lifecycle, eviction, clearing, auto-finalize behavior, immutability, download payload/runtime behavior, and max-capacity validation.
- Deviations from original plan:
  - Corrected runtime assumption for tests: runner tests run in Node, so download behavior was implemented behind an injectable runtime adapter instead of directly depending on DOM globals.
  - Added explicit positive-integer validation for `maxBatches` to enforce buffer invariants.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- diagnostic-buffer` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed (138 files, 1186 tests).
