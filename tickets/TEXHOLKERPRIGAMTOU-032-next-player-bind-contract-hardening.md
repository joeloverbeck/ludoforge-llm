# TEXHOLKERPRIGAMTOU-032: nextPlayerByCondition Binder Contract Hardening

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-011
**Blocks**: TEXHOLKERPRIGAMTOU-033

## Problem

`nextPlayerByCondition` now uses an explicit `bind`, but runtime-facing validation still permits malformed binders (for example empty/whitespace strings). This weakens contract safety for direct `GameDef` inputs and creates avoidable runtime ambiguity.

## 1) What should be added/changed

1. Enforce canonical binder validity for `OptionsQuery.query = "nextPlayerByCondition"` across schema + behavioral validation surfaces.
2. Reject empty/whitespace binders and non-canonical binder identifiers (follow canonical binding identifier contract used elsewhere).
3. Add explicit diagnostics for invalid query binders with stable reason codes and path-localized errors.
4. Keep kernel/compiler game-agnostic; no game-specific exceptions.

## 2) Invariants that must pass

1. Any `nextPlayerByCondition.bind` accepted by validators is non-empty and canonical.
2. Invalid binders are rejected deterministically with clear diagnostics before simulation.
3. Valid existing usage remains accepted without semantic drift.
4. No aliases/back-compat binder formats are introduced.

## 3) Tests that must pass

1. Add/extend unit tests validating acceptance of canonical binders and rejection of malformed binders for `nextPlayerByCondition`.
2. Add/extend schema tests proving invalid binders fail validation at AST/schema level.
3. Add/extend GameDef validation tests proving diagnostic code/path correctness for invalid binders.
4. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`
