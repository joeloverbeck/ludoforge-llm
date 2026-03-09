# ENG-218: Consolidate Sequence-Context Grant Reference Extraction

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator utility cleanup, shared sequence-context parsing
**Deps**: archive/tickets/ENG/ENG-205-sequence-context-linkage-validation.md, archive/tickets/ENG/ENG-216-path-sensitive-sequence-context-linkage-validation.md, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts

## Problem

Sequence-context grant parsing is duplicated in multiple validator paths. `effect-grant-sequence-context-paths.ts` and `validate-gamedef-behavior.ts` both decode `sequence`, `captureMoveZoneCandidatesAs`, and `requireMoveZoneCandidatesFrom` into the same reference shape. That duplication makes future fixes drift-prone and increases the chance that event-grant and effect-grant validation diverge.

## Assumption Reassessment (2026-03-09)

1. Current code already uses one shared `SequenceContextLinkageGrantReference` type across effect-path and event-grant validation.
2. The logic that decides whether a grant contributes a linkage reference is still duplicated rather than centralized.
3. Mismatch: a future schema or diagnostic change would need to be patched in multiple places. Correction: move to one canonical extractor utility and reuse it everywhere.

## Architecture Check

1. One parser for sequence-context grant references is cleaner than keeping structurally identical code in separate validator modules.
2. This is purely generic validator infrastructure; it does not encode any game-specific rules and preserves the `GameSpecDoc` vs agnostic engine boundary.
3. No compatibility aliasing is required; callers should migrate directly to the shared helper.

## What to Change

### 1. Create one canonical extractor

Promote the reference extraction logic into a shared utility function that returns `SequenceContextLinkageGrantReference | null` from any `FreeOperationSequenceContextGrantLike`.

### 2. Reuse the extractor across validation paths

Update both event-grant linkage validation and effect-path traversal to call the same helper and source the shared reference type from the same module.

### 3. Lock behavior with focused tests

Add or adjust unit coverage so invalid/missing sequence context, missing sequence metadata, and valid capture/require extraction continue to behave the same after the refactor.

## Files to Touch

- `packages/engine/src/kernel/effect-grant-sequence-context-paths.ts` (modify or split shared utility out)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify if current coverage is indirect only)

## Out of Scope

- Changing sequence-context feature semantics
- Runtime issuance behavior for grants
- Any game data, `GameSpecDoc`, or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. Event-grant and effect-grant validation derive identical linkage references from the same input shape.
2. Refactoring the shared extractor does not change existing diagnostic outcomes for current sequence-context tests.
3. Existing suite: `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

### Invariants

1. There is exactly one canonical implementation of sequence-context linkage reference extraction in the validator codepath.
2. Validation remains game-agnostic and introduces no compatibility layer or legacy alias behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add focused coverage or assertions that pin shared extractor behavior through public validation outcomes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine test`
