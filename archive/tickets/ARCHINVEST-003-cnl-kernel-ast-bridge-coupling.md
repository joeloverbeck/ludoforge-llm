# ARCHINVEST-003: Investigate CNL compile-effects to kernel AST bridge coupling

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — investigation only
**Deps**: None

## Problem

Git history shows 25 co-changes between `cnl/compile-effects.ts` and `kernel/schemas-ast.ts` over 6 months. The compiler imports AST builders (`chooseOneBuilder`, `chooseNBuilder`) from `kernel/ast-builders.ts`. This could indicate excessive coupling where AST schema changes routinely break the compiler in non-trivial ways, or it could be expected coupling for a compiler targeting an AST (mechanical "add field to schema, add field to compiler" changes).

**Source**: `reports/architectural-abstractions-2026-04-09-fitl-events-1968-nva.md` — Needs Investigation item C.

## Assumption Reassessment (2026-04-09)

1. The ticket’s named compiler file has path drift: [packages/engine/src/cnl/compile-effects.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-effects.ts) is now a thin re-export, while the live lowering logic is split across [packages/engine/src/cnl/compile-effects-core.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-effects-core.ts) and specialized lowering modules such as [packages/engine/src/cnl/compile-effects-choice.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-effects-choice.ts).
2. The builder dependency is thinner than the ticket phrased it. `compile-effects-choice.ts` imports `chooseOne` and `chooseN` from [packages/engine/src/kernel/ast-builders.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/ast-builders.ts), but those builders are typed convenience wrappers over `buildEffect(...)`, not an additional schema layer.
3. The co-change count is close but stale. Recomputed against the live surfaces, there are 26 six-month commits that touched both compiler lowering files and [packages/engine/src/kernel/schemas-ast.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/schemas-ast.ts). The pattern is still mostly mechanical: AST additions, stricter contracts, or type-tag propagation. I did not find evidence of repeated non-trivial compiler breakage caused by schema churn.

## Architecture Check

1. Closing this as expected compiler-to-target coupling is cleaner than proposing a compiler IR without evidence that the current AST target boundary is unstable. The compiler is supposed to track the AST contract it emits.
2. The boundary stays Foundation-compliant: the compiler lowers declarative authored data into generic kernel ASTs, and the schemas remain the authoritative generic contract for those AST shapes.
3. No compatibility shims, alias paths, or partial migrations are needed because the investigation found no runtime or compiler contract change to make.

## Investigation Steps

### 1. Classify the 25 co-changes

```bash
git log --since="6 months ago" --oneline -- packages/engine/src/cnl/compile-effects.ts packages/engine/src/kernel/schemas-ast.ts
```

Corrected live-surface classification:

- True six-month overlap is 26 compiler/schema commits when `compile-effects-core.ts` is included.
- Representative **mechanical** co-changes:
  - `612115e4` added `ValueExpr` type tags; the compiler started emitting `_t` metadata while schemas allowed those tags.
  - `017b3559`, `61c23864`, `48c645cb`, `2ae1c655`, `530915cb` expanded AST/query shapes and lowered matching compiler output in the same change.
  - `9c295208` renamed a domain term (`factions` to `seats`) across compiler and schema surfaces.
- Potentially **non-trivial** candidates were limited to broad foundational commits like the monorepo introduction (`27bb8337`) and initial AST surface growth. Those are architecture-establishing changes, not repeated evidence that schema edits unexpectedly broke the compiler.
- Conclusion: fewer than 5 recent co-changes qualify as genuinely non-trivial, and none demonstrated a recurring “schema changed, compiler unexpectedly broke” pattern.

### 2. Check compiler breakage pattern

- Six-month history for the live surfaces produced only three subject-level candidates: `perf: add ValueExpr type-tag discriminants`, `Fixed issues with the action tooltips`, and `refactor: rename factions → seats`.
- The tooltip fix (`e7484dd4`) touched `schemas-ast.ts` only, not compiler lowering.
- The performance and refactor commits were intentional contract updates, not evidence of an AST-schema regression cascading into complex compiler repair work.
- I found neither incidence nor mechanism of a recurring compiler-breakage pattern caused by AST schema edits.

### 3. Assess builder dependency

- The live imports are in specialized lowering modules such as `compile-effects-choice.ts`, not in the re-export facade.
- `ast-builders.ts` exports named typed helpers like `chooseOne(...)` and `chooseN(...)`, each delegating directly to generic `buildEffect(kind, payload)`.
- That makes the dependency a thin typed convenience over the kernel AST shape, not a second semantic representation or deep compiler/runtime bridge.

### 4. Determine outcome

- Verdict: expected compiler-to-target coupling; no action needed.
- Follow-up spec/ticket: not needed. The evidence does not support introducing a separate compiler IR layer for this surface.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (read only — re-export facade checked)
- `packages/engine/src/cnl/compile-effects-core.ts` (read only — live lowering surface checked)
- `packages/engine/src/cnl/compile-effects-choice.ts` (read only — builder usage checked)
- `packages/engine/src/kernel/schemas-ast.ts` (read only)
- `packages/engine/src/kernel/ast-builders.ts` (read only)
- `reports/architectural-abstractions-2026-04-09-fitl-events-1968-nva.md` (modify — record resolved verdict)
- `tickets/ARCHINVEST-003-cnl-kernel-ast-bridge-coupling.md` (modify — capture investigation outcome)

## Out of Scope

- Designing a compiler IR (follow-up if fracture confirmed)
- Modifying the AST schema or compiler

## Acceptance Criteria

### Tests That Must Pass

1. No runtime or test command changes required; this is a read-only investigation.

### Invariants

1. No code changes made during investigation.
2. The ticket and source report record a concrete verdict backed by live file inspection and recomputed git history.

## Test Plan

### Commands

1. `git log --since="6 months ago" --oneline -- packages/engine/src/cnl/compile-effects-core.ts packages/engine/src/kernel/schemas-ast.ts packages/engine/src/kernel/ast-builders.ts`
2. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-04-09

Investigation confirmed that the CNL lowering code is coupled to the kernel AST in the expected way for a compiler targeting a typed AST contract. The builder dependency is thin, the apparent bridge file has since been split into smaller lowering modules, and the recent co-change pattern is dominated by mechanical AST/compiler synchronization rather than repeated compiler breakage. No follow-up IR/spec ticket was created.
