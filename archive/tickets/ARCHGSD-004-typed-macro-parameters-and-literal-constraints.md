# ARCHGSD-004 - Typed Macro Parameters and Literal Constraints

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Type**: Architecture / Validation  
**Depends on**: none

## Reassessed current state (verified against repo)
- `EffectMacroParam` already includes a `type` field in `src/cnl/game-spec-doc.ts`, but `src/cnl/expand-effect-macros.ts` currently validates only missing/extra args, not arg/type compatibility.
- Current compile path (`compileGameSpecToGameDef`) expands effect macros before lowering, so argument validation belongs in macro expansion for deterministic compile-time failures.
- Existing coverage lives in:
  - `test/unit/expand-effect-macros.test.ts`
  - `test/integration/effect-macro-compile.test.ts`
- The originally proposed integration test path `test/integration/effect-macro-compile-pipeline.test.ts` does not exist.

## Why this ticket exists
Macro declarations can express parameter intent, but invocation arguments are not constraint-checked. This allows invalid args to flow deeper into lowering/runtime behavior and weakens contracts.

## 1) Updated specification (what must change)
- Extend macro parameter contracts to support constrained literal domains, in addition to existing macro param types:
  - keep existing types (`string`, `number`, `effect`, `effects`, `value`, `condition`, `query`);
  - add constrained domains for:
    - enums (`{ kind: enum, values: string[] }`);
    - literal sets (`{ kind: literals, values: (string|number|boolean|null)[] }`).
- Add compile-time validation in effect macro expansion:
  - validate each provided arg against its declared param contract;
  - emit deterministic diagnostics with stable codes/paths;
  - include deterministic linkage to declaration location for constraint failures.
- Keep compiler/kernel generic:
  - no game-specific branches;
  - constraints are DSL data only.
- Migrate production macros where stricter contracts are known (at minimum faction-like params in `data/games/fire-in-the-lake.md`) to constrained enum contracts.
- No backward-compat aliases for invalid invocation forms.

## 2) Architectural assessment
- Benefit over current architecture:
  - stronger local contracts at DSL boundary;
  - earlier deterministic failure mode (before lowering/runtime);
  - safer macro reuse and composition.
- Cost/tradeoff:
  - slightly stricter authoring rules for macro declarations and invocations.
- Decision:
  - proceed; this is a net improvement in robustness/extensibility with low surface-area change.

## 3) Invariants (must remain true)
- Invalid macro args fail at compile time.
- Valid invocations remain deterministic and preserve current GameDef/runtime behavior.
- Diagnostics remain deterministic, including invocation arg path and parameter declaration path context.
- GameDef/simulator behavior remains engine-generic.

## 4) Tests that must pass
## New/updated tests to add
- `test/unit/expand-effect-macros.test.ts`
  - accepts valid enum/literal constrained invocations;
  - rejects invalid literals/types with stable diagnostic codes/paths;
  - verifies declaration-path linkage diagnostics for constraint violations.
- `test/integration/effect-macro-compile.test.ts`
  - verifies constrained macro params through full compile pipeline.

## Existing commands that must pass
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome
- Completion date: 2026-02-14
- What was changed:
  - Added constrained macro param contracts (`enum`, `literals`) to `EffectMacroParam` typing.
  - Implemented compile-time macro arg constraint validation in effect macro expansion with deterministic diagnostics.
  - Tightened invalid invocation handling by rejecting unexpected args as compile errors.
  - Added declaration-path linkage diagnostics for constraint violations.
  - Migrated known FITL faction-like macro params to enum constraints in production data.
  - Corrected one production macro contract (`pieceType`) from `string` to `value` to match real invocation usage.
  - Added/updated unit and integration tests in existing macro test suites.
- Deviations from original plan:
  - No new standalone test files were created; coverage was added to existing `expand-effect-macros` and `effect-macro-compile` suites (as documented in the reassessed ticket scope).
  - `pieceType` contract correction was added after strict validation exposed a real mismatch in production data.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed (148/148).
