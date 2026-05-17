# 180STDVECOBSROL-001: Phase 0 - Ordinary-operation standing-projection witness

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Tests only - no production implementation.
**Deps**: `archive/tickets/179ACTSELPRE-009.md`

## Problem

Spec 179 proved the synthetic `outcomeGrantResolve` opt-in substrate, but current production FITL ordinary operations and event/free-operation grants do not provide a closing `outcomeGrantResolve` witness. Spec 180 now owns the ordinary-operation standing visibility successor. Before implementation starts, this ticket must add the first focused failing witness and preserve the current outer-preview silent-0 bug as a testable invariant.

## Assumption Reassessment (2026-05-17)

1. `archive/tickets/179ACTSELPRE-009.md` selected Spec 180 as the successor architecture and rejected a separate `previewEffect.*` namespace unless the integrated standing route proves insufficient.
2. Current code has status-aware preview outcomes and `unknownPreviewRefs`, but `seatAgg(sum)` over unavailable preview cells can still collapse to numeric `0`.
3. The first implementation ticket needs a generic fixture that proves ordinary-operation standing signal without relying on FITL-specific engine branches or production `outcomeGrantResolve` activation.

## Architecture Check

1. The witness must exercise the one-rules protocol: published action-selection candidate, generic apply path, bounded continuation, and terminal margin/ranking recomputation.
2. The fixture must be game-agnostic: four generic seats, terminal margins, and ordinary operation effects expressed in GameSpecDoc/GameDef-compatible data.
3. No compatibility aliasing or alternate preview namespace is introduced by this test-only phase.

## What to Change

### 1. Add the ordinary-operation standing witness

Create `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts`.

The test should currently fail because the engine lacks Spec 180's standing-projection route. The fixture must publish two action-selection candidates:

- one candidate reaches an ordinary operation body that changes an opponent terminal margin through the normal published-decision/apply path;
- one candidate does not change opponent standing.

The expected post-fix assertion is that the value-bearing candidate reports a ready differentiated opponent standing cell, while capped/unobservable projection reports an explicit unavailable status rather than numeric `0`.

### 2. Pin the outer-preview silent-zero bug

Create `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` or extend the closest existing preview-integrity test if it already owns this invariant. The witness records current behavior where preview-derived `seatAgg(sum)` can contribute numeric `0` when all per-seat cells are unavailable.

## Files to Touch

- `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` (new)
- `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` (new or nearest existing test modified)

## Out of Scope

- Production standing-projection implementation.
- `seatAgg.availability` implementation.
- FITL ARVN campaign reruns.
- New public `previewEffect.*` namespace.

## Acceptance Criteria

### Tests That Must Pass

1. The silent-zero witness passes and records the current bug shape.
2. The ordinary-operation standing witness is checked in as the focused RED witness for `tickets/180STDVECOBSROL-002.md`.
3. `pnpm -F @ludoforge/engine build`.
4. `pnpm run check:ticket-deps`.

### Invariants

1. The failing witness uses only generic GameSpecDoc/GameDef constructs.
2. The witness does not claim production FITL `outcomeGrantResolve` activation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts` - focused RED witness for ordinary-operation standing projection.
2. `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` - current silent-0 bug pin.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled test command for the silent-zero witness.
3. Focused compiled test command for the ordinary-operation RED witness, recorded as expected failing evidence for ticket 002.
4. `pnpm run check:ticket-deps`
