# 197DOCGATPLA-001: Strategy-module gating fields + compiler validation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `cnl/game-spec-doc.ts`, `kernel/types-core.ts`, `cnl/compile-agent-strategy-modules.ts`, `schemas/GameDef.schema.json`
**Deps**: `specs/197-doctrine-gated-plan-template-eligibility.md`

## Problem

Strategy modules (the "doctrine" carriers per Spec 186 §11) influence the *scoring tier* of plan-template candidates via `highestDoctrineTier`, but they cannot *filter* the candidate set. The schema lacks the surface to declare doctrine-driven plan-family activation. This ticket adds the authoring surface and compile-time validation; the proposer behavior change lands in 002.

## Assumption Reassessment (2026-05-26)

1. `GameSpecStrategyModuleDef` lives at `packages/engine/src/cnl/game-spec-doc.ts:752-783` and currently declares `traceLabel`, `when`, `applies`, `priority`, `selectors`, `scoreGroups`, `guardrailIds`, `fallback`. Confirmed via direct read.
2. Compiled IR `StrategyModuleDef` lives at `packages/engine/src/kernel/types-core.ts:828-840` with `id`, `traceLabel`, `when`, `applies`, `priority`, `selectors`, `scoreGroups`, `guardrailIds`, `fallback`, `costClass`, `dependencies`. Confirmed.
3. Strategy-module validation is inline in `packages/engine/src/cnl/compile-agent-strategy-modules.ts` (453 LoC). No standalone `validate-agent-strategy-modules.ts` exists, but sibling `validate-agent-plan-templates.ts` does — implementer may add validation inline OR create a parallel sibling validator; the spec is permissive.
4. JSON-schema mirror at `packages/engine/schemas/GameDef.schema.json` carries `strategyModules` entries (verified at lines 1943, 3040, 3648, 3941, 3992, 7105). Must be regenerated via `pnpm turbo schema:artifacts`.
5. `arvn.trainGovern`, `arvn.patrolGovern`, `arvn.assaultRaid`, `arvn.trainTransport` all exist in FITL profile (`data/games/fire-in-the-lake/92-agents.md` lines 990, 1002, 1027, 1040) — referenced by downstream ticket 003's compile-time validation against the demo migration.

## Architecture Check

1. **Engine agnosticism (F#1)**: Gating is generic over template ids. The kernel treats `enablesPlanTemplates` / `suppressesPlanTemplates` as opaque id sets; no game-specific identifiers leak into engine code.
2. **Compiler-Kernel validation boundary (F#12)**: Every constraint derivable from the spec alone — unknown template id reference, self-contradictory module (same id in both enables and suppresses), degenerate empty-effect (every enables-id also in suppresses-set) — is rejected at compile time with a module-named diagnostic. The kernel does not re-validate at runtime.
3. **No backwards-compatibility shims (F#14)**: New fields are optional in the YAML schema; the compiled IR normalizes absent values to empty arrays. This is the *defined* semantic for absent fields (default-permissive), not a fallback or alias path. No compatibility wrappers needed.
4. **Strongly typed identifiers (F#17)**: Template id fields use `PlanTemplateId` (the branded type), not raw strings. Same convention as the rest of the agent profile IR.

## What to Change

### 1. Extend `GameSpecStrategyModuleDef` YAML schema

In `packages/engine/src/cnl/game-spec-doc.ts` at lines 752-783, add the two new optional fields:

```ts
export interface GameSpecStrategyModuleDef {
  // ... existing fields preserved ...
  readonly fallback?: { /* unchanged */ };
  readonly enablesPlanTemplates?: readonly string[];
  readonly suppressesPlanTemplates?: readonly string[];
}
```

### 2. Extend `StrategyModuleDef` IR

In `packages/engine/src/kernel/types-core.ts` at lines 828-840, add the compiled IR fields:

```ts
export interface StrategyModuleDef {
  // ... existing fields preserved ...
  readonly dependencies: CompiledAgentDependencyRefs;
  readonly enablesPlanTemplates: readonly PlanTemplateId[];   // empty when absent in spec
  readonly suppressesPlanTemplates: readonly PlanTemplateId[]; // empty when absent in spec
}
```

The compile step must normalize absent → `[]` so downstream consumers can iterate without nullity checks.

### 3. Compile-time validation in `compile-agent-strategy-modules.ts`

Add three validation rules (preferred location: inline within the existing compiler; alternatively, extract into a new sibling `validate-agent-strategy-modules.ts` mirroring `validate-agent-plan-templates.ts` if the implementer prefers structural symmetry):

- **Rule A**: Every id in `enablesPlanTemplates` and `suppressesPlanTemplates` references an existing template in the same profile's `planTemplates`. Mismatch fails compile with a module-named diagnostic (e.g., `"strategy module 'buildPoliticalEngine': enablesPlanTemplates references unknown plan template 'arvn.unknownTemplate'"`).
- **Rule B**: A single module that declares the same template id in BOTH `enablesPlanTemplates` and `suppressesPlanTemplates` fails compile (authoring inconsistency).
- **Rule C**: A single module where every `enablesPlanTemplates` id is also in `suppressesPlanTemplates` (degenerate empty effect) fails compile.

The compiler does NOT enforce non-empty eligibility sets per module — a module with a single-element `enablesPlanTemplates` list is valid.

### 4. Regenerate JSON-schema artifacts

Run `pnpm turbo schema:artifacts` so `packages/engine/schemas/GameDef.schema.json` reflects the new `strategyModules` schema fields. The regen is idempotent; running twice must produce byte-identical output.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/cnl/compile-agent-strategy-modules.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify — via `pnpm turbo schema:artifacts` regen, not hand-edited)
- `packages/engine/test/unit/cnl/strategy-module-gating-validation.test.ts` (new — compiler error corpus per §8)

## Out of Scope

- Eligibility filter implementation in the plan proposer — owned by 002.
- Trace-field extensions for `filteredOutTemplates` — owned by 002.
- FITL profile migration (`buildPoliticalEngine` doctrine declares gating fields) — owned by 003. This ticket only ships the schema/IR/validator; the FITL data file is unchanged.
- Cross-profile architectural-invariant tests — owned by 004.
- `tags`-field addition to plan templates — explicitly deferred per spec §11 (tag-driven gating is not in scope).

## Acceptance Criteria

### Tests That Must Pass

1. **Compile error corpus** (architectural-invariant): unknown `enablesPlanTemplates` id fails with module-named diagnostic.
2. **Compile error corpus**: unknown `suppressesPlanTemplates` id fails with module-named diagnostic.
3. **Compile error corpus**: self-contradictory module (same id in enables and suppresses) fails compile.
4. **Compile error corpus**: degenerate empty-effect module (every enables-id also in suppresses-set) fails compile.
5. **Positive corpus**: a fixture with each new field populated compiles cleanly and the IR carries the new fields with the expected `PlanTemplateId[]` shapes.
6. **Default-empty positive**: a fixture with NO gating fields compiles cleanly; the IR carries `enablesPlanTemplates: []` and `suppressesPlanTemplates: []`.
7. Existing engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. **Schema artifact idempotency**: `pnpm turbo schema:artifacts` run twice produces byte-identical `GameDef.schema.json`.
2. **Build determinism (F#8)**: `pnpm turbo build` twice produces byte-identical GameDef.
3. **IR normalization**: every `StrategyModuleDef` in compiled output carries `enablesPlanTemplates` and `suppressesPlanTemplates` as non-null arrays (empty when absent in spec).
4. **No backwards-compat aliasing (F#14)**: no alternative field names accepted; only the exact `enablesPlanTemplates` / `suppressesPlanTemplates` keys validate.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/strategy-module-gating-validation.test.ts` (new) — covers acceptance criteria 1-6. Each error case asserts the diagnostic text includes the module id. Test class: `architectural-invariant`.

### Commands

1. `pnpm turbo build && pnpm -F @ludoforge/engine test:unit dist/test/unit/cnl/strategy-module-gating-validation.test.js`
2. `pnpm turbo schema:artifacts` (verify clean regen; run twice and `diff` the output)
3. `pnpm turbo lint typecheck test`

## Outcome

Completion date: 2026-05-26

What landed:
- Added optional authored `GameSpecStrategyModuleDef.enablesPlanTemplates` and `suppressesPlanTemplates` fields and normalized compiled `StrategyModuleDef` / `CompiledAgentStrategyModule` fields to non-null `PlanTemplateId[]`.
- Added the missing `PlanTemplateId` brand in `types-core.ts`; the ticket's branded-id requirement was otherwise not representable in the live codebase.
- Added compile-time validation for unknown plan-template ids, same-module enables/suppresses contradictions, and degenerate empty-effect declarations, with module-named diagnostics.
- Regenerated `packages/engine/schemas/GameDef.schema.json`.
- Added `packages/engine/test/unit/cnl/strategy-module-gating-validation.test.ts` covering the error corpus, populated positive case, and default-empty normalization.

Additional touched-file scope:
- Fixture and serialized-library mirrors required empty `enablesPlanTemplates` / `suppressesPlanTemplates` arrays because the compiled IR fields are now mandatory: `packages/engine/test/determinism/plan-trace-replay.test.ts`, `packages/engine/test/helpers/spec-190-plan-root-fixture.ts`, `packages/engine/test/unit/agents/plan-proposal-strategy-module-isolation.test.ts`, `packages/engine/test/unit/agents/plan-proposal.test.ts`, and `packages/engine/test/unit/agents/strategy-module-test-fixtures.ts`.

Verification:
- `pnpm turbo build` — passed after fixture fallout migration.
- `node --test dist/test/unit/cnl/strategy-module-gating-validation.test.js` from `packages/engine` — passed, 3/3 tests.
- `pnpm turbo schema:artifacts` — passed twice; second run produced no additional tracked drift beyond the regenerated schema artifacts.
- `pnpm -F @ludoforge/engine test` — passed, including `schema:artifacts:check` and default lane summary `171/171 files passed`.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test` — passed; all 5 Turbo tasks successful, including engine default lane summary `171/171 files passed`.

Command substitution:
- `pnpm -F @ludoforge/engine test:unit dist/test/unit/cnl/strategy-module-gating-validation.test.js` expanded through the package script to broad unit/architecture globs and became unsuitable as a focused proof lane. User approved interrupting/replacing it with direct `node --test dist/test/unit/cnl/strategy-module-gating-validation.test.js`; no matching `node --test` process remained before replacement.

Source-size ledger:
- `packages/engine/src/cnl/compile-agents.ts` | before 5960 | after 5961 | crossed cap? no, preexisting oversize | active growth +1 | user-approved deferral option 2: canonical compiler hub, extraction would widen this ticket | successor none
- `packages/engine/src/cnl/game-spec-doc.ts` | before 1107 | after 1109 | crossed cap? no, preexisting oversize | active growth +2 | user-approved deferral option 2: canonical schema/type hub, extraction would widen this ticket | successor none
- `packages/engine/src/kernel/schemas-core.ts` | before 3305 | after 3309 | crossed cap? no, preexisting oversize | active growth +4 | user-approved deferral option 2: canonical generated-schema source hub, extraction would widen this ticket | successor none
- `packages/engine/src/kernel/types-core.ts` | before 2966 | after 2971 | crossed cap? no, preexisting oversize | active growth +5 | user-approved deferral option 2: canonical kernel type hub, extraction would widen this ticket | successor none

Deferred scope:
- Plan-proposer filtering and trace provenance landed in `archive/tickets/197DOCGATPLA-002.md`.
- FITL `buildPoliticalEngine` migration remains owned by `tickets/197DOCGATPLA-003.md`.
- Cross-profile invariant and golden trace coverage remain owned by `tickets/197DOCGATPLA-004.md`.
