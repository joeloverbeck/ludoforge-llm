# CROGAMPRIELE-008: expandTemplates orchestrator + compiler-core integration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — compiler pipeline wiring
**Deps**: CROGAMPRIELE-001, CROGAMPRIELE-002, CROGAMPRIELE-003, CROGAMPRIELE-004, CROGAMPRIELE-005

## Problem

The five expansion passes (001-005) each create standalone functions. They need to be orchestrated in the correct order and wired into the `compileGameSpecToGameDef` pipeline before `expandConditionMacros`. This ticket creates the `expandTemplates` orchestrator and integrates it.

## Assumption Reassessment (2026-03-01)

1. `compileGameSpecToGameDef` in `compiler-core.ts:204-231` currently starts with `expandConditionMacros(doc)`. The new orchestrator must run before this call.
2. Each expansion pass returns `{ doc: GameSpecDoc; diagnostics: Diagnostic[] }`.
3. The pipeline collects diagnostics: `[...conditionExpansion.diagnostics, ...macroExpansion.diagnostics, ...expanded.diagnostics]` (`compiler-core.ts:212`). Template diagnostics must be prepended.
4. Pass A4 (`expandZoneTemplates`) depends on seat IDs from seatCatalog data assets — it pre-scans `doc.dataAssets` internally, so no external dependency.
5. Passes A1-A3 are independent and can run in any order. A4 is independent. A5 logically runs last (phase templates may reference zones/vars produced by earlier passes).

## Architecture Check

1. A single orchestrator function keeps `compileGameSpecToGameDef` clean — only one new call site, not five.
2. The orchestrator collects all template diagnostics and returns them as a flat array alongside the expanded doc.
3. The ordering (A1 → A2 → A3 → A4 → A5) is stable and deterministic.

## What to Change

### 1. Create `expand-templates.ts`

New file implementing `expandTemplates(doc: GameSpecDoc): { doc: GameSpecDoc; diagnostics: Diagnostic[] }`.

```typescript
export function expandTemplates(doc: GameSpecDoc): { doc: GameSpecDoc; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];

  const a1 = expandPieceGeneration(doc);
  diagnostics.push(...a1.diagnostics);

  const a2 = expandBatchMarkers(a1.doc);
  diagnostics.push(...a2.diagnostics);

  const a3 = expandBatchVars(a2.doc);
  diagnostics.push(...a3.diagnostics);

  const a4 = expandZoneTemplates(a3.doc);
  diagnostics.push(...a4.diagnostics);

  const a5 = expandPhaseTemplates(a4.doc);
  diagnostics.push(...a5.diagnostics);

  return { doc: a5.doc, diagnostics };
}
```

### 2. Wire into `compileGameSpecToGameDef` in `compiler-core.ts`

At line 209 (currently `const conditionExpansion = expandConditionMacros(doc);`), insert before:

```typescript
const templateExpansion = expandTemplates(doc);
const conditionExpansion = expandConditionMacros(templateExpansion.doc);
```

And prepend `templateExpansion.diagnostics` to the collected diagnostics at line 212:

```typescript
const diagnostics: Diagnostic[] = [
  ...templateExpansion.diagnostics,
  ...conditionExpansion.diagnostics,
  ...macroExpansion.diagnostics,
  ...expanded.diagnostics,
];
```

### 3. Create integration test

Test that verifies the full pipeline: a doc with template patterns → `compileGameSpecToGameDef` → GameDef with expanded entities, no template artifacts remaining.

## Files to Touch

- `packages/engine/src/cnl/expand-templates.ts` (new)
- `packages/engine/src/cnl/compiler-core.ts` (modify — insert `expandTemplates` call)
- `packages/engine/test/integration/expand-templates-integration.test.ts` (new)

## Out of Scope

- Individual expansion pass implementations (001-005) — already implemented
- Kernel type changes (006, 007)
- JSON Schema updates (009)
- Game spec migrations (010, 011)
- Error recovery between passes — if A1 produces errors, A2-A5 still run on the (partially) expanded doc

## Acceptance Criteria

### Tests That Must Pass

1. Doc with all 5 template patterns (generate, batch markers, batch vars, zone templates, phase templates) compiles successfully through the full pipeline.
2. Compiled GameDef contains expanded entities with no template artifacts.
3. Template diagnostics appear in the compile result's diagnostics array.
4. Doc with no template patterns compiles identically to before (regression test).
5. Existing suite: `pnpm turbo test`

### Invariants

1. `expandTemplates` runs BEFORE `expandConditionMacros` — condition macros may reference entities created by template expansion.
2. Template diagnostics are collected before macro/compile diagnostics in the final array.
3. The orchestrator is a pure function.
4. No mutation of the input `GameSpecDoc`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/expand-templates-integration.test.ts` — end-to-end pipeline test with template patterns. Rationale: validates orchestration order and pipeline integration.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/expand-templates-integration.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
