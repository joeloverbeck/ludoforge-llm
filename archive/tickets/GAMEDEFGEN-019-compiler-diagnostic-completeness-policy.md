# GAMEDEFGEN-019: Compiler Diagnostic Completeness Policy for Partial-Compile Failures

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Medium

## 1) Reassessed Assumptions

1. The compiler already behaves as a **dependency-aware best-effort** pipeline, not strict fail-fast:
   - independent sections continue compiling after earlier section failures,
   - cross-validation runs after lowering,
   - individual cross-reference checks are gated by required section availability.
2. Deterministic diagnostics infrastructure already exists (`sortDiagnosticsDeterministic`, `dedupeDiagnostics`, `capDiagnostics`) and is applied in compiler finalization.
3. Existing tests already cover key partial-compile mechanics (for example: section nulling behavior and cross-ref skip when target section is null), but there is still a coverage gap for **mixed lowerer + cross-validator deterministic output in one compile result**.
4. The ticket should not assume a greenfield policy decision; the architecture has already converged on best-effort with dependency gating.

## 2) Updated Scope

1. **Codify the existing policy explicitly** as compiler contract:
   - Policy: dependency-aware best-effort diagnostics.
   - Rule: emit diagnostics from sections that can still compile.
   - Rule: skip cross-validation checks whose prerequisites are unavailable (null sections), to avoid misleading or contradictory diagnostics.
2. Ensure this policy is explicit in compiler code-level contract comments and reinforced by tests.
3. Strengthen tests for deterministic ordering when both lowering diagnostics and cross-validation diagnostics are emitted in the same partial-compile run.
4. Keep behavior game-agnostic and generic across all `GameSpecDoc` inputs.

## 3) Invariants

1. Compiler partial-compile behavior follows one explicit policy: dependency-aware best-effort with gated cross-validation.
2. Diagnostics are deterministic for identical invalid documents.
3. Compiler does not emit contradictory cross-reference diagnostics when prerequisite sections failed to compile.
4. Policy remains game-agnostic and independent of specific content packs.

## 4) Tests That Should Pass

1. Unit: mixed lowerer + cross-validator failure scenarios produce deterministic diagnostics across repeated compilation.
2. Unit: cross-reference checks are skipped when prerequisite sections are null due to earlier failures.
3. Regression: existing compiler diagnostics and cross-validation suites remain green.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Reassessed and corrected ticket assumptions to align with the existing architecture (dependency-aware best-effort diagnostics with null-section gated cross-validation).
  - Codified the policy contract directly in compiler flow comments at the cross-validation boundary.
  - Added deterministic mixed-failure coverage and dependency-gating coverage in compiler top-level unit tests.
- Deviations from original plan:
  - Original wording implied selecting a new policy; implementation confirmed policy already existed and focused work on explicit codification and test hardening instead of architectural replacement.
- Verification results:
  - `npm run lint` passed.
  - `npm run build` passed.
  - `npm run test:all` passed (212/212).
