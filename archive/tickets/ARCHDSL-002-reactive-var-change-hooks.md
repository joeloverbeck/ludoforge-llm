# ARCHDSL-002 - Reactive Variable-Change Hooks (`onVarChanged`)

**Status**: ✅ COMPLETED  
**Priority**: High  
**Depends on**: None

## 1) Reassessed assumptions and scope

Introduce a generic reactive trigger primitive so `GameSpecDoc` can express “when variable X changes, apply Y” once, instead of manually patching each mutation site.

### Corrected assumptions (based on current code)

- Trigger infrastructure already exists and is generic:
  - runtime dispatch: `src/kernel/trigger-dispatch.ts`
  - typed trigger model: `src/kernel/types-core.ts`
  - schema validation/lowering: `src/kernel/schemas-core.ts`, `src/cnl/validate-spec-core.ts`, `src/cnl/compile-lowering.ts`
- Recursion/loop protection already exists via trigger depth truncation (`maxTriggerDepth`) and trace entries (`kind: 'truncated'`). This ticket should reuse that mechanism for var-change cascades, not add a separate guard subsystem.
- Variable mutation code paths are centralized in `src/kernel/effects-var.ts` (`setVar`/`addVar`) and are the correct emission point for deterministic var-change events.
- FITL ADSID logic is currently encoded through repeated macro calls at Trail mutation sites in `data/games/fire-in-the-lake.md`; this is exactly the architectural duplication this ticket should remove.
- `src/cnl/compile-triggers.ts` does not exist; trigger lowering currently lives in `src/cnl/compile-lowering.ts`.

### Architectural assessment

- Proposed change is **more robust and extensible** than current architecture:
  - centralizes mutation reactivity in the engine (DRY),
  - removes game-data duplication/hotspots (fewer missed call sites),
  - keeps behavior declarative in `GameSpecDoc`/YAML (engine-agnostic),
  - scales cleanly to future reactive mechanics beyond FITL ADSID.
- Current architecture (manual macro invocation at each mutation site) is fragile and easy to regress when new mutation paths are added.

### Required implementation changes

- Add trigger/event model support for variable mutation hooks:
  - proposed event shape: `varChanged`
  - fields: `scope`, `var`, `oldValue`, `newValue`, and `player` for per-player scope.
- Extend trigger event types/schemas/lowering/validation so trigger conditions can consume `oldValue/newValue` via bindings.
- Extend runtime effect pipeline to emit `varChanged` events deterministically after committed var writes in `setVar` and `addVar`.
- Reuse existing trigger recursion protection (`maxTriggerDepth` + truncation log entries) for self-triggering var mutations.
- Preserve deterministic no-op behavior: no event emission when a write does not change value.
- Refactor FITL ADSID usage to one declarative trigger entry instead of repeated macro calls on each Trail mutation branch.

### Expected files to touch (minimum)

- `src/kernel/types-core.ts` (TriggerEvent type)
- `src/kernel/schemas-core.ts` (TriggerEvent schema)
- `src/cnl/compile-lowering.ts` (trigger event lowering)
- `src/cnl/validate-spec-core.ts` + `src/cnl/validate-spec-shared.ts` (trigger event key/shape validation)
- `src/kernel/validate-gamedef-behavior.ts` (cross-reference validation for var names/scopes)
- `src/kernel/effects-var.ts` (emit `varChanged` events)
- `src/kernel/trigger-dispatch.ts`
- `src/cnl/cross-validate.ts` (if trigger event cross-reference checks are centralized there)
- `data/games/fire-in-the-lake.md` (ADSID refactor to hook form)

## 2) Invariants that should pass

- Hook mechanism is generic (no game-specific code paths).
- Trigger ordering is deterministic and documented.
- No duplicate firing when a var write is a no-op (oldValue === newValue).
- Infinite reactive loops are bounded by existing deterministic trigger-depth guardrails.
- Existing non-hook game specs continue to execute unchanged.

## 3) Tests that should pass

### New/updated unit tests

- `test/unit/trigger-dispatch.test.ts`
  - dispatches `varChanged` triggers and exposes event bindings (`$var`, `$oldValue`, `$newValue`, etc.).
- `test/unit/effects-var.test.ts`
  - emits `varChanged` events on `setVar/addVar` changes and does not emit on no-op writes.
- `test/unit/compile-top-level.test.ts` and/or `test/unit/schemas-top-level.test.ts`
  - validates GameSpecDoc hook schema and diagnostics.
- `test/unit/validate-gamedef.test.ts` and/or `test/unit/cross-validate.test.ts`
  - validates var/scope references for `varChanged` trigger events.

### New/updated integration tests

- `test/integration/fitl-momentum-formula-mods.test.ts`
  - ADSID triggers exactly once per Trail change.
  - ADSID does not trigger when Trail remains unchanged.
  - multiple Trail changes in one action produce expected deterministic total.

### Full-suite gates

- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- Completion date: 2026-02-14
- Implemented:
  - Added generic `varChanged` trigger event support across kernel types, dispatcher matching, bindings, compiler lowering, and schema surfaces.
  - Emitted deterministic `varChanged` events from `setVar`/`addVar` only on committed value changes.
  - Refactored FITL ADSID from duplicated Trail-site macro calls to one declarative trigger (`triggers` section).
  - Fixed architecture gap discovered during implementation: emitted events from nested control-flow effects (`forEach`/`removeByPriority`) now propagate correctly.
  - Added/updated unit and integration coverage for var-change triggers, var reference validation, schema acceptance, and multi-change ADSID behavior.
- Deviations from original plan:
  - Did not keep doc-level trigger var reference checks in `validate-spec-core`; this produced false positives for FITL where authoritative vars are finalized at compiled `GameDef` stage (for example data-asset-derived tracks). Validation is enforced at compiled/cross-validated stages instead.
  - Added a runtime propagation fix in control-flow effects because it was required for robust reactive behavior and revealed by new tests.
- Verification:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed (full unit + integration suite).
