# CROGAMPRIELE-005: Parameterized phase templates compiler pass (A5)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler pipeline (new expansion pass), GameSpecDoc types
**Deps**: None (independent compiler pass)

## Problem

Texas Hold'em's flop, turn, and river phases share ~90% of their `onEnter` logic (~60% duplicated YAML). FITL's coup sub-phases share reset patterns. A `phaseTemplates` section with `fromTemplate` references should expand into concrete phase definitions at compile time via parameter substitution.

## Assumption Reassessment (2026-03-01)

1. `GameSpecPhaseDef` exists in `game-spec-doc.ts:88-92` with `id`, optional `onEnter`, optional `onExit`.
2. `GameSpecTurnStructure.phases` is `readonly GameSpecPhaseDef[]` (`game-spec-doc.ts:57`).
3. `GameSpecDoc` has no `phaseTemplates` field currently — it must be added.
4. Parameter substitution is simple string replacement on scalar values in the template body. The spec uses `"{paramName}"` as the pattern — a quoted string that gets replaced with the arg value.
5. Phase templates can include `actionDefaults` (from CROGAMPRIELE-006), but the expansion pass does not need to understand `actionDefaults` semantically — it just copies the template body with substitutions.

## Architecture Check

1. Compile-time phase expansion eliminates duplication without kernel changes — the GameDef sees only concrete phases.
2. Parameter substitution is intentionally simple (string replacement, no expression evaluation) to keep the compiler pass straightforward.
3. No backwards-compatibility shims — `fromTemplate` entries coexist with regular phase definitions via union type.

## What to Change

### 1. Add types and `phaseTemplates` field to `game-spec-doc.ts`

```typescript
export interface GameSpecPhaseTemplateParam {
  readonly name: string;
}

export interface GameSpecPhaseTemplateDef {
  readonly id: string;
  readonly params: readonly GameSpecPhaseTemplateParam[];
  readonly phase: Readonly<Record<string, unknown>>;  // Template body — a phase shape with "{param}" placeholders
}

export interface GameSpecPhaseFromTemplate {
  readonly fromTemplate: string;
  readonly args: Readonly<Record<string, unknown>>;
}

// Add to GameSpecDoc:
readonly phaseTemplates: readonly GameSpecPhaseTemplateDef[] | null;

// Change GameSpecTurnStructure.phases type:
readonly phases: readonly (GameSpecPhaseDef | GameSpecPhaseFromTemplate)[];
```

Also update `createEmptyGameSpecDoc()` to include `phaseTemplates: null`.

### 2. Create `expand-phase-templates.ts`

New file implementing `expandPhaseTemplates(doc: GameSpecDoc): { doc: GameSpecDoc; diagnostics: Diagnostic[] }`.

Algorithm:
1. If `doc.phaseTemplates` is null/empty and no `fromTemplate` entries exist in phases, return doc unchanged.
2. Build a lookup map: `templateId → GameSpecPhaseTemplateDef`.
3. Iterate `doc.turnStructure.phases`. For regular phase entries (`id` key), pass through.
4. For `fromTemplate` entries:
   a. Look up template by `fromTemplate` value. If not found, emit diagnostic.
   b. Validate: all declared `params` are provided in `args`; no extra `args` keys.
   c. Deep-clone the template's `phase` body.
   d. Walk all string values in the cloned body. Replace `"{paramName}"` with the arg value. For numeric/boolean arg values used in place of `"{paramName}"` strings, replace the string with the raw value (type coercion from string to number/boolean).
   e. Emit the expanded phase as a `GameSpecPhaseDef`.
5. Collect all phase IDs (regular + expanded). Check for duplicates.
6. Also process `turnStructure.interrupts` the same way (if they contain `fromTemplate` entries).
7. Return new doc with expanded phases and `phaseTemplates` removed (no longer needed downstream).

### 3. Create unit tests

Test file covering:
- Template with 3 params instantiated 3 times (flop/turn/river pattern).
- String param substitution in nested structures (deep object trees).
- Numeric param substitution (value becomes number, not string).
- Missing template reference produces diagnostic.
- Missing required param in `args` produces diagnostic.
- Extra param in `args` (not declared in template) produces diagnostic.
- Duplicate expanded phase IDs produce diagnostic.
- Mixed regular + `fromTemplate` phases preserve order.
- Template with `onExit` is expanded correctly.
- No `phaseTemplates` and no `fromTemplate` entries = no-op.
- Template referenced multiple times with different args produces distinct phases.
- `phaseTemplates` field is removed from output doc.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add template types, `phaseTemplates` field, widen phases type)
- `packages/engine/src/cnl/expand-phase-templates.ts` (new)
- `packages/engine/test/unit/expand-phase-templates.test.ts` (new)

## Out of Scope

- Wiring into `compiler-core.ts` (CROGAMPRIELE-008)
- `expandTemplates` orchestrator (CROGAMPRIELE-008)
- Any other expansion passes
- Understanding `actionDefaults` semantics — this pass just copies the template body with substitutions; `actionDefaults` lowering is handled by CROGAMPRIELE-006
- Kernel type changes
- JSON Schema updates
- Game spec migrations

## Acceptance Criteria

### Tests That Must Pass

1. Template with N params instantiated M times produces M concrete `GameSpecPhaseDef` entries with correct substitutions.
2. String values `"{paramName}"` are replaced throughout the template body, including in nested objects and arrays.
3. Numeric args replace `"{paramName}"` strings with the raw numeric value.
4. Missing template reference produces a diagnostic error.
5. Missing required param produces a diagnostic error.
6. Extra param in `args` produces a diagnostic error.
7. Duplicate expanded phase IDs produce a diagnostic error.
8. Mixed regular + `fromTemplate` phases maintain their relative order.
9. No templates = doc passes through unchanged.
10. `phaseTemplates` field is null/absent in the output doc.
11. Existing suite: `pnpm turbo test`

### Invariants

1. `expandPhaseTemplates` is a pure function: same input doc produces same output doc.
2. Output doc's `turnStructure.phases` contains only `GameSpecPhaseDef` entries — no `fromTemplate` entries remain.
3. No mutation of the input `GameSpecDoc`.
4. Parameter substitution is deterministic — same template + same args = same output.
5. Template body structure is preserved exactly (only scalar string values matching `"{paramName}"` are substituted).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-phase-templates.test.ts` — covers all scenarios above. Rationale: validates template lookup, parameter substitution (string + numeric), error conditions, and ordering.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-phase-templates.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
