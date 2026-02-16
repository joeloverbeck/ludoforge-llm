# TEXHOLKERPRIGAMTOU-037: nextInOrderByCondition Anchor Semantics Contract Hardening

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-034
**Blocks**: None

## Problem

`nextInOrderByCondition` currently uses first-match anchor resolution when `source` contains duplicate values, but this behavior is implicit. To keep long-term architecture robust and portable across game genres, anchor semantics should be explicit and tested.

## 1) What needs to be changed/added

1. Make anchor-resolution semantics explicit in compiler/runtime contract documentation and tests (default: first matching anchor index).
2. Add dedicated tests for duplicate-anchor source domains to lock deterministic behavior.
3. Evaluate and, if justified, add explicit optional query policy fields for future-proofing:
- `anchorNotFoundPolicy` (for example `empty` vs `error`)
- `duplicateAnchorPolicy` (for example `first` vs `last` vs `error`)
4. If policy fields are added, update all impacted surfaces coherently (types, schemas, lowering, runtime, validation, tests) with one canonical path and no aliasing.

## 2) Invariants that should pass

1. Duplicate-anchor traversal behavior is deterministic and documented.
2. Anchor-not-found behavior is explicit and stable.
3. Query remains generic and game-agnostic.
4. Any added policy fields preserve deterministic behavior and do not introduce ambiguous runtime semantics.

## 3) Tests that should pass

1. Add/extend unit tests in `test/unit/eval-query.test.ts` for:
- duplicate source values with default semantics
- anchor-not-found contract behavior
- includeFrom interaction with duplicates
2. Add/extend validation/schema/lowering tests if policy fields are introduced.
3. Run `npm run build`.
4. Run `npm run lint`.
5. Run `npm test`.
