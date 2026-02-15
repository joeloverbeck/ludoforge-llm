# FITLRULES1-005: Enforce Strict US Joint-Operations ARVN Spend Rule

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes (`conditionMacros` compile-time expansion + GameSpecDoc section wiring)

## Problem

Rule 1.8.1 requires **strict exceedance** when US spends ARVN Resources:

- US may spend only ARVN Resources that **exceed** Total Econ.
- ARVN may spend ARVN Resources at or below Econ.

Current production YAML does not enforce this consistently for US spending paths, and one existing integration suite encodes the wrong boundary (`>=`) for US joint-ops.

## Reassessed Current State (Code + Tests)

### What was inaccurate in the original ticket

1. Prior line references and action list were stale.
2. The codebase already has an integration suite (`test/integration/fitl-joint-operations.test.ts`) for this rule concept, but it currently asserts the wrong boundary behavior for US (`remaining == totalEcon` allowed).
3. The issue is not isolated to one branch; it appears in multiple US spending paths in `data/games/fire-in-the-lake/30-rules-actions.md`.

### Confirmed US ARVN-spend sites to cover

In `data/games/fire-in-the-lake/30-rules-actions.md`, US-actor spend paths include:

1. `train-us-profile`:
- ARVN-cubes branch (direct `addVar arvnResources -3`, guarded only by `__freeOperation`).
- US pacification sub-action uses `rvn-leader-pacification-cost` macro (currently no US-vs-Econ guard).

2. `assault-us-profile`:
- ARVN follow-up deducts `arvnResources -3` when not Body Count (no US-vs-Econ guard).

3. `us-op-profile` (joint operation stub profile used by existing integration tests):
- `costValidation` currently allows boundary via `left >= totalEcon` where `left = arvnAfterSpend`.
- This should be strict `>` for Rule 1.8.1 compliance.

ARVN-actor profiles (`train-arvn-profile`, `patrol-arvn-profile`, `sweep-arvn-profile`, `assault-arvn-profile`) should remain **unconstrained by Total Econ** beyond their existing costs.

## Scope (Updated)

1. Update US ARVN-spend checks to enforce:

```yaml
arvnResources - spendAmount > totalEcon
```

2. Introduce first-class `conditionMacros` in CNL so reusable condition logic remains data-driven in `GameSpecDoc`, not hardcoded in engine branches.
3. Keep ARVN spending semantics unchanged.
4. Keep free-operation and momentum exceptions unchanged unless they conflict with the strict joint-ops rule.

## Implementation Direction (Architecture)

Prefer a **single reusable macro** for US joint-ops validation instead of repeating per-branch predicates, and support this with a first-class compile-time condition-macro pass.

Implemented macro contract (in `data/games/fire-in-the-lake/20-macros.md`):

- `id`: `us-joint-op-arvn-spend-eligible`
- Params: `resourceExpr`, `costExpr`
- Returns/usage: condition equivalent to
  `resourceExpr > totalEcon + costExpr`

This is consumed in each US spend site (`train-us-profile`, US pacification spend path, `assault-us-profile` ARVN follow-up, `us-op-profile` costValidation).

Rationale:

- Reduces duplicated arithmetic and boundary drift.
- Keeps behavior data-driven and game-encoded (no engine hardcoding).
- Improves long-term extensibility for future US cost amounts (3, 4 with Ky, variable expressions).

## Invariants

1. US spending is legal only if post-spend ARVN Resources remain **strictly greater** than `totalEcon`.
2. ARVN spending may reduce resources to or below `totalEcon`.
3. Boundary case for US is illegal:
- if `arvnResources - cost == totalEcon`, reject.
4. Rule respects dynamic `totalEcon` values.
5. Existing non-US cost systems remain unchanged.

## Tests

### Modified

1. `test/integration/fitl-joint-operations.test.ts`
- US boundary case now asserts **blocked** when `remaining == totalEcon`.
- ARVN behavior remains permissive.

2. `test/unit/game-spec-doc.test.ts`
- Empty doc shape now includes `conditionMacros: null`.

3. `test/unit/parser.test.ts`
- Parsed empty doc expectation now includes `conditionMacros: null`.

4. `test/fixtures/cnl/full-valid-spec.golden.json`
- Parser golden expected doc now includes `conditionMacros: null`.

### Added

5. `test/integration/fitl-us-arvn-resource-spend-constraint.test.ts`
- Structural contract coverage for US-only strict spend guards and shared macro wiring.

6. `test/unit/expand-condition-macros.test.ts`
- Unit coverage for condition macro expansion, missing args diagnostics, and cycle detection.

## Non-Goals

1. No kernel/runtime architectural rewrite.
2. No backward-compat preservation for incorrect boundary behavior (`>=`) in US joint-op spending.
3. No changes to ARVN’s own spending permissions at/below Econ.

## Outcome

- Completion date: 2026-02-15
- Actually changed:
  - Enforced strict US boundary (`postSpend > totalEcon`) in `us-op-profile` cost validation.
  - Added first-class `conditionMacros` support in CNL (`GameSpecDoc`, parser/compose section handling, compiler expansion pass, public export).
  - Added compile-time condition macro expander and diagnostics for duplicate IDs, arg mismatches, unknown macros, cycles, and depth limits.
  - Added strict US-only ARVN spend guards in production action YAML for:
    - US Train ARVN-cubes branch
    - US Pacification spend points in `train-us-profile`
    - US Assault ARVN follow-up gating
  - Updated `test/integration/fitl-joint-operations.test.ts` boundary expectation from allow-at-equality to block-at-equality.
  - Added `test/integration/fitl-us-arvn-resource-spend-constraint.test.ts` and `test/unit/expand-condition-macros.test.ts`.
  - Updated parser/unit golden expectations for the new `conditionMacros` section.
- Deviations from original plan:
  - Original ticket assumptions were stale (line references, test baseline, and affected sites). Scope was corrected before implementation to match current code.
  - Implemented a generic condition-macro architecture in engine/CNL instead of YAML-only duplication, because this is more robust and extensible for future non-FITL games.
  - Added explicit structural regression tests for US-only guard wiring instead of relying only on scenario/runtime examples.
- Verification:
  - `npm run lint` passed.
  - `npm test` passed (full unit + integration suite).
