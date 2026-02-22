# ANIMDIAG-002: Diagnostic Ring Buffer

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-001

## Problem

Animation diagnostic data needs to be buffered in memory so it can be exported on demand. An unbounded log would grow indefinitely during long sessions. A ring buffer capped at N batches (~1-2 minutes of gameplay) provides full recent history without memory growth. This buffer is the central storage that the logger writes to and the UI reads from.

## Assumption Reassessment (2026-02-22)

1. No existing diagnostic buffer exists in `packages/runner/src/animation/` — confirmed, this is a new file.
2. `DiagnosticBatch` and all entry types will be available from ANIMDIAG-001.
3. Browser APIs `URL.createObjectURL`, `Blob`, and programmatic `<a>` click are available in the runner's browser context for file download.

## Architecture Check

1. A dedicated `diagnostic-buffer.ts` module is cleaner than embedding buffer logic in the logger — separation of concerns between storage and logging.
2. Ring buffer pattern (overwrite oldest when full) is the right choice over unbounded array or LRU — simple, predictable memory, no eviction policy complexity.
3. No backwards-compatibility concerns — entirely new module.

## What to Change

### 1. Create `diagnostic-buffer.ts`

New file at `packages/runner/src/animation/diagnostic-buffer.ts`.

**`DiagnosticBuffer` interface**:
- `readonly maxBatches: number` — capacity (default 100)
- `beginBatch(isSetup: boolean): void` — starts a new mutable accumulator
- Stage-specific recording methods: `recordTrace()`, `recordDescriptors()`, `recordSpriteResolution()`, `recordEphemeralCreated()`, `recordTween()`, `recordFaceControllerCall()`, `recordTokenVisibilityInit()`, `recordQueueEvent()`, `recordWarning()`
- `endBatch(): void` — freezes the accumulator and appends to the ring buffer (drops oldest if at capacity)
- `getBatches(): readonly DiagnosticBatch[]` — returns all stored batches
- `downloadAsJson(): void` — triggers a browser file download
- `clear(): void` — empties the buffer

**`createDiagnosticBuffer(maxBatches?: number): DiagnosticBuffer`** factory function.

### 2. Implement ring buffer internals

- Internal mutable array of `DiagnosticBatch`, capped at `maxBatches`.
- `beginBatch()` creates a mutable accumulator object. Calling `beginBatch()` while one is open should `endBatch()` the previous one first (defensive).
- Auto-incrementing `batchId` counter.
- `endBatch()` freezes the accumulator into a `DiagnosticBatch` (using `Object.freeze` or spread) and pushes to the ring buffer. If length exceeds `maxBatches`, shift the oldest entry.

### 3. Implement `downloadAsJson()`

- Serialize `getBatches()` with a `meta` header containing: `{ exportedAt: ISO string, batchCount: number, oldestBatchId: number, newestBatchId: number }`.
- Create `Blob` with `application/json` MIME type.
- Generate filename: `anim-diagnostic-${ISO timestamp}.json` (colons replaced with dashes for filesystem safety).
- Use `URL.createObjectURL()` + programmatic `<a>` element click + `URL.revokeObjectURL()` cleanup.

## Files to Touch

- `packages/runner/src/animation/diagnostic-buffer.ts` (new)
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
4. **Download**: Mock `URL.createObjectURL` and verify the blob content is valid JSON with correct `meta` header and batch data.
5. **Empty batch**: `beginBatch()` → `endBatch()` with no records produces a batch with empty arrays.
6. **Auto-incrementing batchId**: Each batch gets a unique incrementing ID.
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Buffer length never exceeds `maxBatches`.
2. `getBatches()` returns immutable data — callers cannot mutate internal state.
3. `downloadAsJson()` produces valid JSON that can be parsed back.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/diagnostic-buffer.test.ts` — full unit test suite covering lifecycle, ring buffer eviction, clear, download, empty batch, and batchId sequencing.

### Commands

1. `pnpm -F @ludoforge/runner test -- diagnostic-buffer`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
