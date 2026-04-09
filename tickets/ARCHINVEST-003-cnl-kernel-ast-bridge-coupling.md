# ARCHINVEST-003: Investigate CNL compile-effects to kernel AST bridge coupling

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None expected
**Deps**: None

## Problem

Git history shows 25 co-changes between `cnl/compile-effects.ts` and `kernel/schemas-ast.ts` over 6 months. The compiler imports AST builders (`chooseOneBuilder`, `chooseNBuilder`) from `kernel/ast-builders.ts`. This could indicate excessive coupling where AST schema changes routinely break the compiler in non-trivial ways, or it could be expected coupling for a compiler targeting an AST (mechanical "add field to schema, add field to compiler" changes).

**Source**: `reports/architectural-abstractions-2026-04-09-fitl-events-1968-nva.md` — Needs Investigation item C.

## Investigation Steps

### 1. Classify the 25 co-changes

```bash
git log --since="6 months ago" --oneline -- packages/engine/src/cnl/compile-effects.ts packages/engine/src/kernel/schemas-ast.ts
```

For commits touching both files, classify each as:
- **Mechanical**: New AST node added, compiler adds corresponding emission (expected)
- **Non-trivial**: AST shape change that required reworking compiler logic (potential fracture signal)

### 2. Check compiler breakage pattern

Review whether any of the 25 co-changes were bug fixes where a schema change broke the compiler unexpectedly. Look for commit messages containing "fix", "broken", "regression", or similar.

### 3. Assess builder dependency

Read how `compile-effects.ts` uses `chooseOneBuilder` and `chooseNBuilder` from `kernel/ast-builders.ts`. Is this a thin convenience or deep structural coupling?

### 4. Determine outcome

- **If >5 non-trivial co-changes**: This is a real coupling fracture. Create a follow-up spec to introduce a compiler IR layer between game-spec AST and kernel AST.
- **If mostly mechanical**: Close as expected compiler-to-target coupling; no action needed.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (read only)
- `packages/engine/src/kernel/schemas-ast.ts` (read only)
- `packages/engine/src/kernel/ast-builders.ts` (read only)

## Out of Scope

- Designing a compiler IR (follow-up if fracture confirmed)
- Modifying the AST schema or compiler

## Acceptance Criteria

### Tests That Must Pass

N/A — investigation only, no code changes.

### Invariants

1. No code changes made during investigation

## Test Plan

### Commands

N/A — read-only investigation.
