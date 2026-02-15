# GAMESPECDOC-003: Derived Domain Primitives from Vars/Tracks

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Medium  
**Backwards Compatibility**: None (new canonical modeling pattern)

## Assumption Reassessment (2026-02-15)

Ticket assumptions were partially stale and are corrected here before implementation:

1. **Track metadata is already projected into canonical global vars at compile time.**  
   The compiler maps `dataAssets.map.payload.tracks[*]` into `GameDef.globalVars` (`mergeTrackGlobalVars`), including `min/max/init`.
2. **A separate track-specific domain primitive would duplicate sources of truth.**  
   Canonical source should remain declared int-variable bounds in `GameDef.globalVars`/`GameDef.perPlayerVars`; track-backed values are already represented there.
3. **Production duplication is currently in transfer action amount domains.**  
   In FITL production rules, `nvaTransferResources` and `vcTransferResources` hardcode `intsInRange(1..75)` and should be migrated.
4. **Diagnostic expectation should be compile/validation diagnostics.**  
   Missing/non-int source vars for derived bounds should be rejected by validation with explicit diagnostics.

## Updated Scope

Implement one generic derived-domain query sourced from declared int-variable bounds (covers both explicit vars and map-track-projected vars), with optional runtime bound overrides where needed.

## What To Change / Add

Add generic domain primitives to remove hardcoded numeric duplication in action params.

1. Introduce a query/domain form that derives integer ranges from declared int-variable bounds (`globalVars` / `perPlayerVars`).
2. Keep primitives fully game-agnostic (no FITL-specific IDs or branch logic).
3. Update compiler/runtime evaluation and validation for the new form.
4. Migrate applicable production spec usages that duplicate resource caps in action param domains.

## Invariants

1. Domain bounds sourced from declared int-variable bounds are single-source-of-truth.
2. Changing a variable cap (including track-projected globals) automatically updates derived parameter domains without per-action edits.
3. Derived domains remain deterministic and validation-safe.
4. No game-specific behavior is embedded in compiler/kernel.

## Tests

1. **Unit**: derived-domain query resolves to declared int-variable bounds.
2. **Unit**: missing/non-integer source var for derived domain yields explicit validation diagnostic.
3. **Integration**: migrated action(s) compile and legal-move domains align with declared resource bounds.
4. **Regression**: existing static-domain actions still compile and behave identically.

## Outcome

- **Completion date**: 2026-02-15
- **Implemented**:
  - Added new generic query primitive `intsInVarRange` (AST type, schema, CNL lowering, runtime eval, behavior validation).
  - Migrated FITL transfer action domains from hardcoded `intsInRange(1..75)` to derived `intsInVarRange` using canonical resource vars.
  - Added/updated unit and integration tests for lowering, runtime semantics, validation diagnostics, and production transfer actions.
- **Deviations from original plan**:
  - Did not add a separate track-domain primitive. Track bounds are already projected into canonical `globalVars`, so separate track sourcing was removed to avoid duplicate source-of-truth.
- **Verification**:
  - `npm run build` passed.
  - Targeted unit/integration tests for changed areas passed.
  - `npm test` passed.
  - `npm run lint` passed.
