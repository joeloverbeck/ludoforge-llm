# ENGINEARCH-009: Helper Decision Fallback Contract Hardening

**Status**: PENDING
**Priority**: P2
**Depends on**: ENGINEARCH-006

---

## Summary

Remove helper-level sentinel fallbacks (`null`/`[]`) for unresolved decisions and align helpers with kernel chooser semantics (`undefined` means unresolved).

---

## What Needs to Change

- Update helper chooser defaults to return `undefined` when no canonical selection exists, rather than synthetic sentinel values.
- Refactor helper flows to handle incomplete decision sequences explicitly and fail with actionable diagnostics when unresolved.
- Touch helper modules that currently synthesize fallback values:
  - `packages/engine/test/helpers/decision-param-helpers.ts`
  - `packages/engine/test/helpers/move-decision-helpers.ts`
  - `packages/engine/test/helpers/runtime-smoke-harness.ts`
  - `packages/engine/test/helpers/legality-surface-parity-helpers.ts`
- Keep this behavior limited to test/helper layers; engine kernel remains the authoritative contract.

---

## Invariants That Should Pass

- Helpers never fabricate move params that are not selectable under canonical policy.
- Unresolvable pending decisions are surfaced as explicit incomplete/diagnostic outcomes, not hidden by fallback values.
- Helper behavior remains deterministic for fixed seed/input.

---

## Tests That Should Pass

- Add/expand helper-driven tests in:
  - `packages/engine/test/unit/decision-param-helpers.test.ts`
  - `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`
  - `packages/engine/test/integration/runtime-smoke-harness.test.ts`
- Verify no regressions in existing integration suites that depend on helper orchestration.
- Quality gates:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`
