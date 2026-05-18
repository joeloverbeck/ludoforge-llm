# 182STRSTRPOL-001: Phase 2 — Strategic modules library bucket + compiled IR + compiler diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/contracts/policy-contract.ts`, `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/cnl/compile-agents.ts`, compiler diagnostic codes module
**Deps**: `specs/182-structured-strategy-policy-layer-modules-guardrails-and-turn-shape.md`

## Problem

Spec 182 Phase 2 introduces strategic modules — named, declarative scoring groups that activate under conditions, bind selectors, contribute grouped score, declare guardrail attachments, and carry trace labels. This ticket lands the compile-time surface: a new `strategyModules` library bucket, the compiled IR shape per spec §4.2, the `MAX_MODULE_PRIORITY_TIER` constant, and the 9 compiler diagnostics enumerated in spec §4.4. Runtime evaluation (ticket 002) and trace integration (003) depend on these types.

## Assumption Reassessment (2026-05-18)

1. `AGENT_POLICY_LIBRARY_BUCKETS` lives at `packages/engine/src/contracts/policy-contract.ts:1-10` and currently contains 8 entries (`stateFeatures`, `candidateFeatures`, `candidateAggregates`, `selectors`, `pruningRules`, `considerations`, `tieBreakers`, `strategicConditions`) — confirmed during spec reassessment.
2. `MAX_SELECTOR_PRODUCT_PAIRS = 256` and `MAX_SELECTOR_RESULT_ITEMS = 32` live in `packages/engine/src/kernel/types-core.ts:379-380` — confirmed location for sibling constant placement.
3. The compiler bucket-parsing infrastructure in `packages/engine/src/cnl/compile-agents.ts` follows the existing selector-bucket pattern Spec 181 shipped; this ticket mirrors that pattern.
4. `guardrails` bucket does not yet exist; `guardrailIds` forward-references in modules surface as `CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN` until Phase 3 ticket 006 lands the bucket.

## Architecture Check

1. Module IR types live alongside existing `CompiledAgentSelector` and `CompiledPolicyPruningRule` in `types-core.ts`. Generic — no game-specific identifiers (Foundation #1).
2. Diagnostics follow the established `CNL_COMPILER_AGENT_*` naming convention (~30 existing codes verified during reassessment); no collisions with proposed names.
3. The bucket is YAML-authorable inside GameSpecDoc agent definitions per Foundation #2 (Evolution-First).
4. No backwards-compatibility shim — the `strategyModules` bucket is new and additive; existing profiles without it compile unchanged.

## What to Change

### 1. AGENT_POLICY_LIBRARY_BUCKETS

Add `'strategyModules'` to the const array at `packages/engine/src/contracts/policy-contract.ts:1-10` (convention is to add before `'considerations'` to reflect the architectural ordering selectors → modules → guardrails → considerations).

### 2. Compiled IR types in types-core.ts

Add the types from spec §4.2 — branded ids (`ModuleId`, `GuardrailId` forward-declared for module guardrail-ref usage, `ModuleSelectorRoleId`, `ScoreGroupId`), `MAX_MODULE_PRIORITY_TIER = 100` (sibling to `MAX_SELECTOR_PRODUCT_PAIRS`), `ModuleCostClass = 'state' | 'candidate' | 'microturn' | 'preview' | 'auditOnly'`, and `StrategyModuleDef` with sub-types `AppliesSpec`, `PrioritySpec`, `ModuleSelectorBinding`, `ScoreGroupDef`, `ScoreTermDef`, `ModuleFallbackSpec`.

Extend `CompiledPolicyCatalog` to include `readonly strategyModules?: Readonly<Record<string, StrategyModuleDef>>;`.

### 3. Compiler in compile-agents.ts

Add `compileStrategyModules(library)` mirroring the existing `compileSelectors` flow. Wire into the main compile loop with the dependency-cycle check already implemented for selectors. Derive `costClass` from the deepest dependency in `when`, `priority.value`, `scoreGroups[*].terms[*].value`, and bound selectors' cost classes (cheapest scope per spec §4.2 last paragraph).

### 4. Compiler diagnostics

Add the 9 diagnostic codes from spec §4.4 (`CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN`, `_SCORE_GROUP_DUPLICATE_ID`, `_PRIORITY_TIER_OUT_OF_RANGE`, `_SELECTOR_ROLE_DUPLICATE`, `_GUARDRAIL_REQUIRES_PRUNE_FALLBACK`, `_FALLBACK_DEMOTE_REQUIRES_PENALTY`, `_DEPENDENCY_CYCLE`, `_COST_CLASS_EXCEEDS_LIMIT`, `_TRACE_LABEL_DUPLICATE`). Locate the existing `CNL_COMPILER_DIAGNOSTIC_CODES` registry during implementation (likely `packages/engine/src/cnl/diagnostic-codes.ts` or a sibling).

### 5. Diagnostic tests

Create `packages/engine/test/unit/cnl/agent-module-diagnostics.test.ts` (sibling to existing `agent-selector-diagnostics.test.ts`) with one positive-trigger test per diagnostic code. Use the established test pattern for compile-error assertions.

## Files to Touch

- `packages/engine/src/contracts/policy-contract.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify — IR types + `MAX_MODULE_PRIORITY_TIER`)
- `packages/engine/src/cnl/compile-agents.ts` (modify — `compileStrategyModules`)
- `packages/engine/src/cnl/diagnostic-codes.ts` (modify — locate via grep during implementation; add 9 codes)
- `packages/engine/test/unit/cnl/agent-module-diagnostics.test.ts` (new)

## Out of Scope

- Runtime evaluation and dispatch insertion (ticket 002).
- Trace integration (ticket 003).
- FITL/ARVN authoring (tickets 004, 005).
- Guardrail bucket (Phase 3, ticket 006); the `guardrailIds` forward-reference parses but resolves as `CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN` until ticket 006 lands.
- Turn-shape evaluator bucket (Phase 4, ticket 013).

## Acceptance Criteria

### Tests That Must Pass

1. New `agent-module-diagnostics.test.ts` — one passing positive-trigger test per §4.4 diagnostic (9 tests).
2. Existing `agent-selector-diagnostics.test.ts` still passes (no regression in selector handling).
3. `pnpm turbo test` — full engine + runner suite.
4. `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. `strategyModules` bucket is YAML-authorable; no engine-side game-specific identifiers (Foundation #1).
2. Diagnostic codes follow `CNL_COMPILER_AGENT_MODULE_*` naming.
3. `MAX_MODULE_PRIORITY_TIER` is statically declared (not derived at runtime), reproducible across compile passes (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/agent-module-diagnostics.test.ts` — 9 positive-trigger tests, one per §4.4 code.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/cnl/agent-module-diagnostics.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
