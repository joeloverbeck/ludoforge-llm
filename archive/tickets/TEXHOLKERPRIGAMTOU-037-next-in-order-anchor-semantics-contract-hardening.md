# TEXHOLKERPRIGAMTOU-037: nextInOrderByCondition Anchor Semantics Contract Hardening

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-034
**Blocks**: None

## Assumption Reassessment (Current Code/Test Reality)

1. Runtime traversal currently resolves anchor index using `Array.findIndex(...)` in `src/kernel/eval-query.ts`, which deterministically selects the first matching anchor when `source` contains duplicates.
2. Anchor-not-found behavior is already explicit in runtime and already covered by unit tests (`test/unit/eval-query.test.ts`), returning `[]` when `from` is not present in `source`.
3. Existing tests cover wrap-around, includeFrom include/exclude behavior, anchor-not-found, and recoverable `from` failures, but did not pin duplicate-anchor behavior (including `includeFrom` interactions with duplicates).
4. No optional policy fields (for example `anchorNotFoundPolicy` or `duplicateAnchorPolicy`) currently exist in AST types, schemas, or lowering/validation/runtime paths.

## Problem

`nextInOrderByCondition` duplicate-anchor semantics were deterministic in code but not yet codified as an explicit contract artifact. Without explicit tests and contract wording, future refactors could accidentally drift (for example from first-match to last-match behavior).

## 1) Updated Scope and Implementation Direction

1. Make duplicate-anchor semantics explicit as canonical contract behavior:
- Anchor resolution policy: `first` matching source index (deterministic)
- Anchor-not-found policy: return empty result (`[]`)
2. Add dedicated unit coverage for duplicate-anchor domains, including `includeFrom` interplay.
3. Strengthen contract communication close to runtime behavior (code comment and test naming/assertions) so semantics are hard to misinterpret.
4. Do **not** add new policy fields in this ticket; treat policy-surface expansion as a separate, explicit design ticket only if a concrete multi-game need emerges.

## 2) Architecture Decision Rationale

1. Keeping one canonical behavior (`first` + empty-on-missing) is cleaner than introducing premature policy knobs that increase schema/validator/lowering/runtime surface area.
2. Deterministic semantics locked by tests are sufficient for robustness today and reduce long-term maintenance complexity.
3. If future games require alternate policies, those should be introduced deliberately in one cohesive contract revision instead of speculative optional fields now.

## 3) Invariants that must pass

1. Duplicate-anchor traversal behavior is deterministic and contract-explicit (`first` anchor index).
2. Anchor-not-found behavior is deterministic and explicit (`[]`).
3. `includeFrom` semantics remain stable when duplicate anchors are present.
4. Query contract remains generic and game-agnostic (no game-specific branches).

## 4) Tests that must pass

1. Add/extend unit tests in `test/unit/eval-query.test.ts` for:
- duplicate source values with default first-anchor semantics
- `includeFrom` interaction with duplicates
2. Keep existing anchor-not-found coverage intact.
3. Run verification gates:
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- **Completion date**: 2026-02-16
- **What was actually changed**:
  - Updated runtime contract clarity by documenting first-match duplicate anchor policy inline in `src/kernel/eval-query.ts`.
  - Added duplicate-anchor contract tests in `test/unit/eval-query.test.ts`, including `includeFrom` behavior with duplicated anchor values.
  - Reassessed ticket assumptions and narrowed scope to contract hardening and tests.
- **Deviations from original plan**:
  - Did not introduce `anchorNotFoundPolicy` / `duplicateAnchorPolicy` fields. Current architecture is cleaner and more robust with one canonical deterministic behavior; policy expansion was deferred as speculative.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
