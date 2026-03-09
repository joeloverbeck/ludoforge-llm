# ENG-218: Consolidate Sequence-Context Grant Reference Extraction

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — shared validator utility extraction, sequence-context linkage parsing consolidation
**Deps**: archive/tickets/ENG/ENG-205-sequence-context-linkage-validation.md, archive/tickets/ENG/ENG-216-path-sensitive-sequence-context-linkage-validation.md, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts

## Problem

Sequence-context grant parsing is duplicated in multiple validator paths. `effect-grant-sequence-context-paths.ts` and `validate-gamedef-behavior.ts` both decode `sequence`, `captureMoveZoneCandidatesAs`, and `requireMoveZoneCandidatesFrom` into the same reference shape. That duplication makes future fixes drift-prone and increases the chance that event-grant and effect-grant validation diverge.

## Assumption Reassessment (2026-03-09)

1. Current code already uses one shared `SequenceContextLinkageGrantReference` type across effect-path and event-grant validation.
2. The logic that decides whether a grant contributes a linkage reference is still duplicated rather than centralized.
3. Existing tests already cover effect-path traversal directly in `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts`; `packages/engine/test/unit/validate-gamedef.test.ts` only covers the public validation outcomes.
4. Mismatch: keeping the canonical extractor in `effect-grant-sequence-context-paths.ts` would leave a generic parser living in an effect-specific module. Correction: move the shared type and extractor into a neutral kernel helper module and reuse it from both validator paths.

## Architecture Check

1. One parser for sequence-context grant references is cleaner than keeping structurally identical code in separate validator modules.
2. This is purely generic validator infrastructure; it does not encode any game-specific rules and preserves the `GameSpecDoc` vs agnostic engine boundary.
3. A neutral helper module is cleaner than exporting cross-cutting parsing logic from an effect-specific file. No compatibility aliasing is required; callers should migrate directly to the shared helper.

## What to Change

### 1. Create one canonical extractor

Move the shared type and reference extraction logic into a dedicated kernel helper that returns `SequenceContextLinkageGrantReference | null` from any `FreeOperationSequenceContextGrantLike`.

### 2. Reuse the extractor across validation paths

Update both event-grant linkage validation and effect-path traversal to call the same helper and source the shared reference type from the same module.

### 3. Lock behavior with focused tests

Add focused unit coverage for the shared extractor itself, and keep the existing path-traversal and public validation tests passing so invalid/missing sequence context, missing sequence metadata, and valid capture/require extraction continue to behave the same after the refactor.

## Files to Touch

- `packages/engine/src/kernel/sequence-context-linkage-grant-reference.ts` (new)
- `packages/engine/src/kernel/effect-grant-sequence-context-paths.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/kernel/sequence-context-linkage-grant-reference.test.ts` (new)
- `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` (keep passing; modify only if needed)
- `packages/engine/test/unit/validate-gamedef.test.ts` (keep passing; modify only if needed)

## Out of Scope

- Changing sequence-context feature semantics
- Runtime issuance behavior for grants
- Any game data, `GameSpecDoc`, or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. Event-grant and effect-grant validation derive identical linkage references from the same input shape through one neutral shared helper.
2. Refactoring the shared extractor does not change existing diagnostic outcomes for current sequence-context tests.
3. Existing suites: `node --test packages/engine/dist/test/unit/kernel/sequence-context-linkage-grant-reference.test.js`, `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`, `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`

### Invariants

1. There is exactly one canonical implementation of sequence-context linkage reference extraction in the validator codepath, and it lives in a neutral kernel helper module.
2. Validation remains game-agnostic and introduces no compatibility layer or legacy alias behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/sequence-context-linkage-grant-reference.test.ts` — add focused extractor coverage for invalid/missing sequence metadata and valid capture/require references.
2. `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` — keep direct path-traversal coverage green after the shared-helper import change.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — keep public diagnostic coverage green after the shared-helper import change.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/sequence-context-linkage-grant-reference.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`
4. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
5. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-09
- What actually changed: extracted `SequenceContextLinkageGrantReference` plus `collectSequenceContextLinkageGrantReference` into the new neutral helper `packages/engine/src/kernel/sequence-context-linkage-grant-reference.ts`; updated both `validate-gamedef-behavior.ts` and `effect-grant-sequence-context-paths.ts` to consume it; added focused unit coverage in `packages/engine/test/unit/kernel/sequence-context-linkage-grant-reference.test.ts`.
- Deviations from original plan: no changes were needed in `packages/engine/test/unit/validate-gamedef.test.ts` or `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` because existing public-validator and effect-path tests already covered the relevant behavior and remained green after the extraction.
- Verification results: `pnpm -F @ludoforge/engine build`; `node --test packages/engine/dist/test/unit/kernel/sequence-context-linkage-grant-reference.test.js`; `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`; `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`; `pnpm -F @ludoforge/engine test`; `pnpm turbo lint`.
