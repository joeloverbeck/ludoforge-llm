# ENGINEARCH-154: Introduce Domain-Scoped Diagnostic Code Registries and Typed Factories

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — cross-module diagnostic taxonomy contract hardening in kernel/cnl
**Deps**: archive/tickets/ENGINEARCH-153-choice-options-diagnostic-code-contract-single-source-derivation.md

## Problem

Most diagnostics across kernel/cnl still rely on open `string` code assignment. This allows taxonomy drift outside locally hardened helpers and weakens compile-time ownership of diagnostic contracts.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/diagnostics.ts` defines `Diagnostic.code` as `string`.
2. The codebase is not uniformly open-string anymore: some domains already use explicit canonical diagnostic code ownership (for example `choice-options-runtime-shape-diagnostic.ts` from ENGINEARCH-153), but several high-traffic domains still rely on string-typed fields and direct string literals.
3. In `packages/engine/src/kernel/action-selector-contract-registry.ts`, diagnostic-code fields are currently typed as `string` even though values are canonical and shared by multiple callers (`compile-lowering.ts`, `cross-validate.ts`).
4. In compiler helper paths (`packages/engine/src/cnl/binding-diagnostics.ts` and `missingCapabilityDiagnostic` in `compile-lowering.ts`), code ownership is still inline string literals.
5. Corrected scope: harden two bounded domains that are already central to compiler/kernel diagnostic flows, not "most diagnostics across kernel/cnl".

## Architecture Check

1. Domain-scoped typed registries/factories are cleaner and more extensible than ad-hoc string literals spread across modules.
2. For action-selector violations, moving diagnostic construction behind a typed contract API is more robust than repeating violation-to-diagnostic mapping logic at each call site.
3. For compiler helper diagnostics, centralizing canonical code constants + builders provides stronger ownership while keeping migration bounded and incremental.
4. This is engine-generic contract hardening only; no game-specific behavior/data enters GameDef/runtime/simulation.
5. No backwards-compatibility aliases/shims; migrate directly to typed ownership in touched domains.

## What to Change

### 1. Establish typed code registries for selected diagnostic domains

Create canonical `as const` code registries (or equivalent typed contract modules) for:
- one compiler helper domain (`binding shadow` + `missing capability` helpers),
- one kernel/shared contract domain (`action-selector` role diagnostics).

### 2. Introduce typed diagnostic construction helpers for those domains

Replace direct ad-hoc writes in touched domains with typed factory/helper APIs that only emit registered codes. In action-selector flows, call sites should consume a shared typed violation-to-diagnostic builder instead of writing codes directly.

### 3. Migrate targeted call sites incrementally

Update a bounded set of modules/tests to consume the new typed surfaces without broad rewrite.

## Files to Touch

- `packages/engine/src/kernel/action-selector-contract-registry.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/cnl/compile-lowering.ts` (modify)
- `packages/engine/src/cnl/binding-diagnostics.ts` (modify)
- `packages/engine/src/cnl/` (new typed compiler diagnostic code registry/helper module if needed)
- `packages/engine/test/unit/kernel/action-selector-contract-registry.test.ts` (modify/extend)
- `packages/engine/test/unit/binding-diagnostics.test.ts` (modify/extend)
- `packages/engine/test/unit/compile-actions.test.ts` and/or `packages/engine/test/unit/cross-validate.test.ts` (modify only if required by migrated builder surface)

## Out of Scope

- Full-repo diagnostic-code migration in one ticket.
- Runtime behavior changes unrelated to diagnostic contract typing.
- Any GameSpecDoc or visual-config content/schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. At least two diagnostic domains (compiler helper + kernel/shared selector contract) use explicit typed code ownership (registry + typed constructor usage).
2. Migrated action-selector call sites (`compile-lowering.ts`, `cross-validate.ts`) no longer assign selector-related diagnostic code strings directly.
3. Migrated compiler helper call sites (`binding-diagnostics.ts`, `missingCapabilityDiagnostic`) no longer embed open diagnostic code strings directly.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Diagnostic taxonomy in migrated domains is compile-time constrained and centrally owned.
2. Engine behavior remains game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/` domain tests for migrated modules — assert existing diagnostic payload behavior remains stable after typed-constructor migration.
2. Add/strengthen registry ownership assertions for canonical codes in migrated domains.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm run check:ticket-deps`

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Added a canonical typed action-selector diagnostic code registry in `packages/engine/src/kernel/action-selector-contract-registry.ts` (`ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES`) and derived diagnostic-code types from that source.
  - Added shared typed action-selector violation diagnostic factory (`buildActionSelectorContractViolationDiagnostic`) and migrated call sites in:
    - `packages/engine/src/cnl/compile-lowering.ts`
    - `packages/engine/src/cnl/cross-validate.ts`
  - Added a compiler helper diagnostic registry/factory module:
    - `packages/engine/src/cnl/compiler-diagnostic-codes.ts`
    - canonical codes for `CNL_COMPILER_BINDING_SHADOWED` and `CNL_COMPILER_MISSING_CAPABILITY`
    - typed helper builders used by:
      - `packages/engine/src/cnl/binding-diagnostics.ts`
      - `missingCapabilityDiagnostic` in `packages/engine/src/cnl/compile-lowering.ts`
  - Extended tests to lock typed ownership and factory behavior:
    - `packages/engine/test/unit/kernel/action-selector-contract-registry.test.ts`
    - `packages/engine/test/unit/binding-diagnostics.test.ts`
  - Added canonical typed cross-validate diagnostic code ownership in:
    - `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts`
    - migrated `packages/engine/src/cnl/cross-validate.ts` away from inline `CNL_XREF_*` literals to typed registry references.
  - Expanded compiler helper code registry ownership and migrated remaining `compile-lowering.ts` literals in scope (`zone var type`, `turn structure legacy field`, `action phase duplicate`, `action capability duplicate`) to canonical registry usage.
  - Added registry drift guard test:
    - `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts`
- **Deviations from original plan**:
  - Scope was explicitly narrowed to two high-impact domains (action-selector contracts + compiler helper diagnostics) instead of a broader migration.
  - `packages/engine/src/kernel/diagnostics.ts` was not changed; domain-level typed ownership was achieved without changing global `Diagnostic.code`.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed (`328` passed, `0` failed).
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm run check:ticket-deps` passed.
