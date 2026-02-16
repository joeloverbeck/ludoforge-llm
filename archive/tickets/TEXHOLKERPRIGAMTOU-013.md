# TEXHOLKERPRIGAMTOU-013: Deterministic Reduce Primitive for Accumulator-Driven Algorithms

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: XL
**Dependencies**: TEXHOLKERPRIGAMTOU-012 (completed; archived)
**Blocks**: TEXHOLKERPRIGAMTOU-014

## 0) Assumption Reassessment (Current Code/Test Reality)

Corrected assumptions after inspecting current engine/compiler/tests:
- Bounded deterministic iteration already exists via canonical `forEach` with enforced guardrails:
  - `forEach.limit` exists and is validated at runtime as a positive safe integer.
  - `forEach` has a default cap of `100` when `limit` is omitted.
  - legality/move-discovery traversal already supports `forEach`.
- Therefore, adding a second bounded loop primitive (for example `repeatUntil`) would duplicate existing control-flow capability and increase architectural surface area without clear net benefit.
- The real remaining gap for layered algorithms is a **first-class fold/reduction primitive** with explicit accumulator semantics.

Architecture decision for this ticket:
- **Do add**: one canonical `reduce` effect primitive.
- **Do not add**: `repeatUntil`/new loop aliases in this ticket.

## 1) What needs to be fixed/added

Add a canonical, game-agnostic `reduce` effect primitive for deterministic accumulator-driven processing in YAML.

Scope:
- Add deterministic `reduce` effect primitive with explicit:
  - item binding
  - accumulator binding
  - initial accumulator value
  - per-item next-accumulator expression
  - optional bounded iteration limit (same guard semantics as existing control-flow)
  - continuation effects receiving final reduced value via binding
- Wire compiler lowering, runtime application, legality traversal, validation, and schemas.
- Provide structured runtime errors for invalid reducer shapes/values.

Constraints:
- No aliasing (`reduce` has one canonical syntax).
- No unbounded runtime behavior.
- Deterministic iteration order and accumulator update semantics must be explicit.
- Keep kernel/compiler logic game-agnostic.

## 2) Invariants that should pass

1. Reducer accumulator updates are deterministic and side-effect ordering is stable.
2. Reduce iteration is bounded (explicit limit or deterministic default guard) and enforced.
3. Runtime failures for invalid reducer shape/value are structured.
4. Primitive is reusable for any game algorithm needing fold-like behavior.
5. Existing effect budget controls remain compatible.

## 3) Tests that should pass

1. Unit: reduce accumulator correctness for numeric and string accumulators.
2. Unit: deterministic ordering invariants for reduce over identical inputs.
3. Unit: reduce limit/default-guard behavior and runtime validation errors.
4. Unit: legality/move-discovery traversal compatibility with reduce.
5. Integration: fixture implementing a layered payout-like fold using reduce.
6. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- **Completion date**: 2026-02-16
- **What was actually changed**:
  - Added canonical `reduce` effect support across AST/schemas/compiler/runtime/validation/legal-choice traversal.
  - Added reducer execution trace support and regenerated schema artifacts.
  - Added/updated unit and integration coverage for reduce semantics and reducer binder contracts.
- **Deviations from original plan**:
  - Did not implement `repeatUntil`; assumption was corrected because bounded iteration already exists via canonical `forEach` + `limit`.
  - Scope was intentionally narrowed to avoid duplicating loop primitives and to keep control-flow architecture minimal and robust.
- **Verification results**:
  - `npm run build` ✅
  - `npm run schema:artifacts:generate` ✅
  - `npm test` ✅
  - `npm run lint` ✅
