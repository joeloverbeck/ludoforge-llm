# ARCHDSL-002 - Reactive Variable-Change Hooks (`onVarChanged`)

**Status**: Pending  
**Priority**: High  
**Depends on**: None

## 1) What needs to change / be added

Introduce a generic reactive trigger primitive so GameSpecDoc can express “when variable X changes, apply Y” once, instead of manually patching each mutation site.

### Required implementation changes

- Add trigger/event model support for variable mutation hooks:
  - proposed event shape: `varChanged`
  - fields: `scope`, `var`, `oldValue`, `newValue`
- Extend AST/types/schemas for triggers that can bind and consume `oldValue/newValue`.
- Extend runtime effect pipeline to emit `varChanged` events deterministically after committed var writes.
- Add recursion/loop protection for self-triggering var mutations (deterministic guardrails with clear failure metadata).
- Enable conditional filtering in hook definitions (e.g., only when `oldValue != newValue`).
- Refactor FITL ADSID usage to one declarative hook entry instead of repeated macro calls on each Trail mutation branch.

### Expected files to touch (minimum)

- `src/kernel/types-events.ts` / trigger type files
- `src/kernel/schemas-extensions.ts` and/or trigger schema files
- `src/kernel/effects-var.ts` / effect dispatch where var mutations occur
- `src/kernel/trigger-dispatch.ts`
- `src/cnl/compile-triggers.ts` (or equivalent)
- `data/games/fire-in-the-lake.md` (ADSID refactor to hook form)

## 2) Invariants that should pass

- Hook mechanism is generic (no game-specific code paths).
- Trigger ordering is deterministic and documented.
- No duplicate firing when a set operation writes the same value (unless explicitly configured otherwise).
- Infinite reactive loops are prevented by deterministic guard rules.
- Existing non-hook game specs continue to execute unchanged.

## 3) Tests that should pass

### New/updated unit tests

- `test/unit/trigger-dispatch.test.ts`
  - dispatches `varChanged` with correct payload.
- `test/unit/effects-var.test.ts`
  - emits hooks on `setVar/addVar` and does not emit on no-op writes when configured.
- `test/unit/compile-top-level.test.ts` and/or `test/unit/schemas-top-level.test.ts`
  - validates GameSpecDoc hook schema and diagnostics.

### New/updated integration tests

- `test/integration/fitl-momentum-formula-mods.test.ts`
  - ADSID triggers exactly once per Trail change.
  - ADSID does not trigger when Trail remains unchanged.
  - multiple Trail changes in one action produce expected deterministic total.

### Full-suite gates

- `npm run build`
- `npm run lint`
- `npm test`

