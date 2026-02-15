# FITLRULES1-003: NVA/VC Resource Transfer Actions

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes (compiler/runtime consistency hardening)

## Problem

Rule 1.5.2 allows NVA and VC players to voluntarily transfer Resources to each other during their Operations/Activities/Events. There are currently no dedicated transfer actions in `data/games/fire-in-the-lake/30-rules-actions.md`.

## Assumption Reassessment (Code/Test Reality)

1. The prior ticket draft assumed `intsInRange.max` could be a runtime `ValueExpr` (for example `{ ref: gvar, var: nvaResources }`).
2. In current engine types/validation/eval, `intsInRange` is strictly numeric (`min: number`, `max: number`):
   - `src/kernel/types-ast.ts`
   - `src/kernel/schemas-ast.ts`
   - `src/kernel/eval-query.ts`
3. Therefore, the old `chooseOne + intsInRange(max = current resources)` proposal is not implementable without engine changes.
4. FITL operations are profile-backed, but non-operation utility actions are still represented as normal actions. Transfer actions can remain plain actions with explicit preconditions and effects.
5. Additional discrepancy found during implementation: CNL compile-time action-param binding checks used implicit `$` normalization while runtime looked up exact param names. This caused compile/runtime inconsistency for non-prefixed param names and needed an engine fix.

## Architectural Decision

Implement transfer as **plain main-phase actions with explicit numeric parameter domains and legality gating in `pre`**:

- `amount` parameter domain: `intsInRange(1..75)`
- `pre` includes donor-resource check against selected `amount`
- effects remain simple `addVar` debit/credit

This keeps engine generic, avoids special-case runtime logic, and uses existing legal-move enumeration semantics.

## What to Change

**File**: `data/games/fire-in-the-lake/30-rules-actions.md`

Add two actions to `actions`:

- `nvaTransferResources` (executor `'2'`)
- `vcTransferResources` (executor `'3'`)

Both should:

- run in `phase: main`
- accept one action param: `amount` in `intsInRange` 1..75
- require active player/executor match and sufficient donor resources in `pre`
- subtract `amount` from donor resource var and add `amount` to recipient var

## Why This Is Better Than the Prior Proposal

1. Uses current engine contracts as-is (no schema/runtime expansion needed).
2. Keeps behavior data-driven in YAML, aligned with GameSpecDoc architecture.
3. Avoids introducing ad-hoc effect-time choice plumbing for something naturally modeled as an action parameter.
4. Preserves deterministic behavior and inspectable legal move sets.

## Invariants

1. Only NVA (player `'2'`) can execute `nvaTransferResources`.
2. Only VC (player `'3'`) can execute `vcTransferResources`.
3. Legal transfer amount is between 1 and donor resources (inclusive).
4. Transfer conserves total `nvaResources + vcResources`.
5. No transfer action is legal when donor resources are 0.

## Tests

1. **Integration compile/legality test**: production spec includes both new actions.
2. **Integration transfer execution test (NVA -> VC)**: exact donor debit, recipient credit, and sum conservation.
3. **Integration transfer execution test (VC -> NVA)**: exact donor debit, recipient credit, and sum conservation.
4. **Integration legality test**: donor at 0 resources yields no legal transfer moves.
5. **Integration bounds test**: transfer amount greater than donor resources is illegal.

## Outcome

- **Completion date**: February 15, 2026
- **What changed (actual)**:
  - Added `nvaTransferResources` and `vcTransferResources` actions in `data/games/fire-in-the-lake/30-rules-actions.md` with `amount` param (`intsInRange` 1..75), donor-balance legality guards, and debit/credit effects.
  - Added `test/integration/fitl-resource-transfer-actions.test.ts` covering compile presence, both transfer directions, zero-resource illegality, and amount-bound enforcement.
  - Added a compiler regression test in `test/unit/compile-actions.test.ts` for non-prefixed action-param bindings in `pre`/`effects`.
  - Fixed compile/runtime binding consistency in `src/cnl/compile-lowering.ts` by using exact action param names (no implicit `$` aliasing).
  - Added runtime guard coverage in `test/unit/legal-moves.test.ts` and hardened `src/kernel/legal-moves.ts` to skip actions whose fixed executor is outside `playerCount` instead of throwing.
- **Deviations from original plan**:
  - Ticket originally claimed no engine changes; implementation required two engine hardening fixes uncovered by tests.
  - Original `chooseOne`/dynamic-`intsInRange.max` concept was replaced by action-parameter modeling due actual kernel constraints.
- **Verification**:
  - `npm test` passed.
  - `npm run lint` passed.
