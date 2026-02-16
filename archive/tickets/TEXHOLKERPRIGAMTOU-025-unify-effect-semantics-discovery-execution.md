# TEXHOLKERPRIGAMTOU-025: Unify Effect Semantics for Discovery vs Execution

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: none
**Blocks**: TEXHOLKERPRIGAMTOU-026, TEXHOLKERPRIGAMTOU-027

## 0) Assumption Reassessment (2026-02-16)

Current repository state differs from this ticket's original assumptions:

1. The split execution model still exists: `legalChoices` owns a dedicated walker in `src/kernel/legal-choices.ts`, while runtime execution flows through `applyEffect`/`applyEffects` in `src/kernel/effect-dispatch.ts`.
2. Control-flow/effect semantics are duplicated across surfaces (`if`, `let`, `forEach`, `reduce`, `removeByPriority`) rather than sharing one interpreter core.
3. Several parity-oriented tests already exist and should be treated as baseline coverage, including:
- `test/unit/kernel/choice-membership-parity.test.ts`
- `test/unit/kernel/legality-surface-parity.test.ts`
- `test/unit/kernel/legal-choices.test.ts` (including `let` + `actualBind` regression coverage)
4. Dependency `TEXHOLKERPRIGAMTOU-024` is already completed and archived (`archive/tickets/TEXHOLKERPRIGAMTOU-024-runtime-quality-gate-harness.md`), so this ticket is no longer blocked by active in-flight work.
5. Existing discovery behavior intentionally diverges from execution in at least one non-random case (invalid control-flow limits fallback in discovery), which violates the intended semantic parity goal.

## 0.1) Updated Scope (Corrected)

1. Introduce a shared kernel interpreter core with explicit mode (`discovery` | `execution`) in `EffectContext`/dispatch.
2. Route `legalChoices` effect probing through the shared interpreter core instead of a bespoke walker.
3. Keep mode-specific differences narrowly scoped and explicit:
- discovery may return pending choice requests for unresolved `chooseOne` / `chooseN`
- discovery does not execute stochastic branch bodies for `rollRandom`
4. For all non-random effects, enforce identical traversal, binding propagation, state progression, and validation/error semantics across discovery and execution.
5. Remove duplicated ad-hoc traversal logic from `legalChoices` once parity path is live.

## 1) What needs to change / be added

1. Replace split semantics between `legalChoices` effect walking and runtime effect dispatch with a shared effect interpreter core.
2. Introduce explicit interpreter mode at the kernel level:
- `discovery` mode for parameter/choice probing
- `execution` mode for actual state mutation execution
3. Move control-flow traversal (`if`, `let`, `forEach`, `reduce`, `removeByPriority`) into the shared interpreter so both surfaces use identical binding/state progression semantics.
4. Preserve game-agnosticity: do not add game-specific exceptions, hooks, or branches.
5. Remove redundant ad-hoc traversal logic from `legalChoices` once parity is achieved.

## 2) Invariants that should pass

1. Discovery and execution evaluate identical effect semantics for all non-random branches, differing only by declared mode behavior.
2. Binding propagation/scoping rules are identical across legal discovery and runtime apply paths.
3. No game-specific behavior is introduced in kernel interpreter logic.
4. Determinism remains stable for identical seed + inputs.
5. Runtime errors surfaced by malformed effect graphs are consistent across surfaces.

## 3) Tests that should pass

1. Unit: interpreter mode contract tests for `choose*`, control-flow, and roll-random mode differences.
2. Unit: parity tests proving equal binding/state/error outcomes between discovery and execution for non-random control-flow paths.
3. Unit: strengthen `legalChoices`/effect parity for malformed control-flow limits (same failure semantics, no discovery-only fallback behavior).
4. Integration: existing Texas + non-Texas suites remain green to confirm no game-specific coupling/regressions.
5. Regression: `npm run build`, `npm test`, `npm run lint`.

## 4) Architecture Rationale

This ticket is more beneficial than the current architecture because:

1. A single interpreter eliminates semantic drift risk between discovery and runtime execution.
2. Explicit mode keeps differences intentional, reviewable, and testable instead of emerging from duplicated logic.
3. Future effect additions become cheaper and safer because semantics are implemented once.
4. Kernel remains game-agnostic and extensible while reducing maintenance overhead.

## Outcome

- Completion date: 2026-02-16
- Implemented:
  - Introduced interpreter mode in `EffectContext` (`execution` | `discovery`) and extended effect results to carry pending choice requests when probing decisions.
  - Replaced the bespoke `legalChoices` walker with shared interpreter dispatch in discovery mode, preserving pipeline preflight/viability behavior while removing duplicate traversal logic.
  - Unified non-random control-flow traversal and choice semantics between discovery and execution, including consistent error behavior and free-operation zone-filter evaluation context.
  - Hardened nested pending-choice propagation across control-flow handlers (`if`, `let`, `forEach`, `reduce`, `removeByPriority`, `evaluateSubset`) so discovery short-circuits correctly at the first unresolved decision.
  - Updated runtime invalid-parameter mapping in `applyMove` to preserve canonical illegal-move surfacing for decision validation failures.
  - Refined control-flow limit semantics to allow `0` as a deterministic no-op limit while keeping negative and non-integer limits invalid.
  - Strengthened test helper deterministic choice defaults to avoid degenerate zero-selection paths during automated decision resolution.
- Deviations from original wording:
  - Control-flow limit policy now accepts non-negative integers (`0` allowed) instead of strictly positive-only values. This was required for robust production-spec execution and still preserves strict validation for negative/non-integer limits.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
