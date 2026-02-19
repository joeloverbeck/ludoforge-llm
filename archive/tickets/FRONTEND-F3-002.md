# FRONTEND-F3-002: Add Card Semantic Classification to Animation Descriptor Pipeline

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No (runner-only, consumes GameDef metadata)
**Deps**: FRONTEND-F3-001

## Problem

`trace-to-descriptors` currently maps only by raw trace kind. It cannot distinguish:
- card deal vs generic token move,
- card burn vs generic token move,
- card flip vs generic token property mutation.

As a result, card-specific animation presets cannot be selected reliably or extensibly.

### Assumption Reassessment (2026-02-19)

1. `FRONTEND-F3-001` is already complete and archived (`archive/tickets/FRONTEND-F3-001.md`), so this ticket can depend on `GameDef.cardAnimation` directly.
2. The current runner architecture uses `presetOverrides` keyed by **trace kind**, which is insufficient for semantic kinds introduced here (`cardDeal` vs `cardBurn` both originate from `moveToken`).
3. Existing tests do not yet cover semantic descriptor kinds end-to-end across:
   - descriptor mapping,
   - preset compatibility,
   - timeline missing-sprite guards,
   - controller-provided card context.
4. No engine/compiler changes are required for this ticket; this remains runner-only.

## What to Change

1. Introduce a pure classification layer in runner animation mapping that consumes:
   - effect trace entries,
   - compiled GameDef card animation metadata (from FRONTEND-F3-001),
   - minimal state context needed to resolve token type/zone semantics.
2. Extend descriptor model with generic card semantic kinds (for example `cardDeal`, `cardBurn`, `cardFlip`) or equivalent semantic flags, while keeping core trace mapping deterministic and pure.
3. Preserve default generic behavior for non-card tokens and unclassified traces.
4. Wire preset resolution to semantic kinds:
   - built-in defaults for card semantics;
   - override points for visual config/preset registry.
   - **Scope correction**: override keys must be descriptor kinds (not trace kinds) so `cardDeal`/`cardBurn`/`cardFlip` can be configured independently.
5. Keep control flow game-agnostic and free of per-game branches.

## Invariants

1. Descriptor classification is deterministic and side-effect free.
2. Classification depends only on generic metadata + trace/state context, never on hardcoded game IDs.
3. Non-card trace mapping behavior remains unchanged unless metadata classifies an entry as card semantic.
4. Detail-level filtering remains consistent (full/standard/minimal) and documented for new card semantics.
5. Missing/partial metadata degrades safely to generic animations without crashing.

## Tests

1. Unit tests for classifier:
   - move from draw-source to hand/shared classified as deal;
   - move to burn role classified as burn;
   - configured face-state property transition classified as flip.
2. Unit tests for fallback behavior when metadata is absent or ambiguous.
3. Unit tests for preset compatibility/selection across new semantic kinds.
4. Unit tests for detail-level filtering with card semantic descriptors.
5. Regression tests: existing trace-to-descriptors coverage for legacy kinds still passes.

## Outcome

- Completion date: 2026-02-19
- Implemented changes:
  - Added pure semantic classifier module: `packages/runner/src/animation/card-classification.ts`.
  - Extended descriptor model with `cardDeal`, `cardBurn`, and `cardFlip`.
  - Updated descriptor mapping to classify card semantics with safe fallback to generic kinds.
  - Upgraded preset override architecture from trace-kind keys to descriptor-kind keys.
  - Extended preset registry compatibility and built-in tween handling for new semantic kinds.
  - Updated timeline missing-sprite guards for `cardDeal`, `cardBurn`, and `cardFlip`.
  - Wired animation controller to derive semantic card context from `GameDef.cardAnimation` + render tokens.
- Deviations from original plan:
  - Scope was tightened to enforce descriptor-kind preset overrides because trace-kind overrides cannot configure `cardDeal` and `cardBurn` independently.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- animation` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
