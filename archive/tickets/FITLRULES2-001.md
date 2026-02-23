# FITLRULES2-001: Option Matrix (Rule 2.3.4)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — turn-flow behavior already exists in kernel; this is production spec data + test coverage + generated fixture sync
**Deps**: None

## Problem

`turnFlow.optionMatrix` is empty in the production FITL spec at `data/games/fire-in-the-lake/30-rules-actions.md:32`.

Rule 2.3.4 requires deterministic second-eligible restrictions based on what the first eligible executed:
- Op Only -> Limited Operation only
- Op + SA -> Limited Operation or Event
- Event -> Operation (with/without SA)

With an empty matrix, those constraints are not expressed in data.

## Assumption Reassessment (Current Code/Test Reality)

1. Kernel support already exists and is generic:
   - `packages/engine/src/kernel/legal-moves-turn-order.ts` (`isMoveAllowedByTurnFlowOptionMatrix`)
   - `packages/engine/src/kernel/types-turn-flow.ts` (`TurnFlowOptionMatrixRowDef`)
2. Existing runtime tests already validate matrix enforcement semantics on synthetic card-driven defs:
   - `packages/engine/test/integration/fitl-option-matrix.test.ts`
3. Gap is production-spec wiring, not kernel logic:
   - Production FITL spec currently encodes `optionMatrix: []`
   - No production-spec assertion currently ensures Rule 2.3.4 rows are present and stable.
4. Runner fixture drift risk exists:
   - `packages/runner/src/bootstrap/fitl-game-def.json` is generated from the production spec.
   - Ticket scope should include regenerating that fixture so runner bootstrap stays aligned.

## Why This Change Is Architecturally Better

This keeps turn-flow policy fully declarative in `GameSpecDoc` data and uses existing generic engine behavior. It improves robustness/extensibility by avoiding game-specific kernel branches and preserving the Agnostic Engine Rule.

## What to Change

1. Update production FITL rules data in `data/games/fire-in-the-lake/30-rules-actions.md`:

```yaml
optionMatrix:
  - first: operation
    second: [limitedOperation]
  - first: operationPlusSpecialActivity
    second: [limitedOperation, event]
  - first: event
    second: [operation, operationPlusSpecialActivity]
```

2. Strengthen tests in `packages/engine/test/integration/fitl-option-matrix.test.ts` by adding a production-spec assertion:
   - Compile production FITL spec.
   - Assert no parse/validate/compile errors.
   - Assert compiled `turnOrder.config.turnFlow.optionMatrix` has exactly the three Rule 2.3.4 rows above.

3. Regenerate runner bootstrap fixture:
   - `packages/runner/src/bootstrap/fitl-game-def.json`

## Invariants

1. Compiled production FITL `GameDef` contains exactly 3 `optionMatrix` rows.
2. Row mapping exactly matches Rule 2.3.4:
   - `operation` -> `[limitedOperation]`
   - `operationPlusSpecialActivity` -> `[limitedOperation, event]`
   - `event` -> `[operation, operationPlusSpecialActivity]`
3. Existing matrix runtime behavior remains intact:
   - operation -> limitedOperation only (+ pass)
   - operationPlusSpecialActivity -> limitedOperation/event (+ pass)
   - event -> operation/operationPlusSpecialActivity (+ pass)
4. Production spec compiles with no new diagnostics.
5. Runner bootstrap fixture generation/check passes after data update.

## Tests

1. `packages/engine/test/integration/fitl-option-matrix.test.ts`
   - Existing runtime matrix enforcement cases (synthetic def) remain green.
   - New production compile assertion validates the actual FITL `optionMatrix` rows.
2. `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
   - Verifies generated runner fixture remains synchronized with production spec.

## Outcome

- Completion date: 2026-02-23
- What was changed:
  - Populated `turnFlow.optionMatrix` in `data/games/fire-in-the-lake/30-rules-actions.md` with Rule 2.3.4 rows.
  - Added production FITL compile assertion coverage to `packages/engine/test/integration/fitl-option-matrix.test.ts`.
  - Regenerated `packages/runner/src/bootstrap/fitl-game-def.json` from production FITL spec.
  - Fixed a kernel edge case in `packages/engine/src/kernel/legal-moves-turn-order.ts` so option-matrix gating does not apply during interrupt phases (this was exposed by commitment-phase tests after the data fix).
- Deviations from original plan:
  - Original ticket assumed data-only changes. Implementation required one kernel fix to preserve interrupt-phase correctness under the stricter, now-correct option matrix.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed (253 tests, 0 failures).
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/runner bootstrap:fixtures:check` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
