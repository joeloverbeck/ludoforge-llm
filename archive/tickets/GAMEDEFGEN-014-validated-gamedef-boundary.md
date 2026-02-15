# GAMEDEFGEN-014: Introduce Validated GameDef Boundary Type

**Status**: COMPLETED  
**Priority**: MEDIUM  
**Effort**: Medium-Large

## 1) What To Fix / Add

1. Introduce a branded/opaque validated `GameDef` boundary type produced only by the validation pipeline.
2. Update compiler outputs to return the validated boundary type (not plain `GameDef`) when diagnostics contain no errors.
3. Update simulator entry points to require/prefer the validated type and enforce guardrails when unvalidated objects are passed at runtime.
4. Keep kernel internals generic; do not add game-specific branches or schema specialization.
5. Document and enforce an explicit compiler -> simulator handoff contract.

## 2) Reassessed Assumptions (Current Code Reality)

1. `compileGameSpecToGameDef` already runs `validateGameDef` before returning a non-null `gameDef`.
2. There is currently no explicit type-level boundary that captures "this `GameDef` has passed validation".
3. Runtime/simulator paths currently accept plain `GameDef` and do not enforce a hard validation boundary.
4. Runtime selector guard checks still exist in kernel execution flows and should remain as defense-in-depth for malformed/manual inputs.
5. Low-level kernel API tests intentionally exercise malformed specs; broad assertion insertion across every kernel surface would reduce diagnostic-fidelity coverage and is not desirable in this ticket.

## 3) Updated Scope

1. In scope:
   - Add `ValidatedGameDef` + boundary helpers in shared kernel validation surface.
   - Make compiler return `ValidatedGameDef | null`.
   - Make simulator APIs consume validated defs and hard-fail on invalid unvalidated runtime inputs.
   - Enforce the same boundary at the high-level game-loop entry (`initialState`) without broad low-level API lock-down.
   - Add/strengthen tests for boundary branding, simulator boundary enforcement, and compile->simulate handoff.
2. Out of scope:
   - Removing existing runtime selector-contract checks inside kernel execution.
   - Broad refactors across all kernel APIs in this ticket.

## 4) Invariants That Should Pass

1. Compiler-produced valid outputs are branded as `ValidatedGameDef` and pass directly into simulator APIs.
2. Non-validated inputs still fail safely and deterministically at validation boundaries.
3. Type contracts remain game-agnostic and reusable.
4. No behavior changes for valid specs; only boundary clarity and safety improve.

## 5) Tests That Should Pass

1. Unit: validated `GameDef` branding only occurs after `validateGameDef` has no error diagnostics.
2. Unit: simulator entry points accept branded defs and fail deterministically for invalid unvalidated defs.
3. Integration: end-to-end compile -> simulate flow uses branded output with no regressions.
4. Regression: existing malformed manual `GameDef` boundary behavior remains deterministic and explicit.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added `ValidatedGameDef` boundary helpers in `src/kernel/validate-gamedef.ts` (`validateGameDefBoundary`, `isValidatedGameDef`, `assertValidatedGameDef`).
  - Updated compiler output contract in `src/cnl/compiler-core.ts` so `CompileResult.gameDef` is `ValidatedGameDef | null`, with boundary validation/branding performed in the compiler pipeline.
  - Updated simulator API boundary in `src/sim/simulator.ts` so `runGame`/`runGames` consume validated defs and enforce runtime guardrails via boundary assertion.
  - Added high-level kernel entry boundary assertion in `src/kernel/initial-state.ts` so manual/unvalidated payloads fail deterministically before state bootstrapping.
  - Strengthened tests in simulator and validation suites to cover branding behavior and invalid unvalidated boundary rejection.
  - Corrected canonical zone-id usage in a fixture-like integration scenario (`test/integration/fitl-event-free-operation-grants.test.ts`) to align with existing no-alias selector/zone contracts surfaced by this stricter boundary.
- Deviations from the original plan:
  - Kept runtime selector-contract checks intact (defense-in-depth), and limited scope to compiler -> simulator boundary instead of broad kernel-wide API migration.
  - Evaluated broad assertions on low-level kernel surfaces (`legalMoves`/`legalChoices`/`applyMove`/`terminalResult`/trigger dispatch) and intentionally did not keep them, because existing tests rely on those APIs to validate malformed-spec runtime behavior and diagnostics.
  - Added explicit reassessment and scope correction in-ticket before implementation due mismatched initial assumptions.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
  - `npm run test:all` passed.
