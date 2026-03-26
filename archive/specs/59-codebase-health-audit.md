# Spec 59 — Codebase Health Audit

**Status**: REJECTED

## Section 0: Summary & Motivation

### Why This Audit

As the codebase grows (~256 source files, ~360 test files across engine and runner packages), technical debt accumulates in predictable patterns. This audit identifies concrete, actionable issues that violate the project's own coding conventions (documented in CLAUDE.md and `.claude/rules/coding-style.md`) and prioritizes them by severity.

### Overall Health Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture | 8.5/10 | Clean module boundaries, no circular deps, well-defined data flow |
| Test/Build | 8.1/10 | Strong coverage, deterministic tests, minor hygiene issues |
| Code Quality | 7.5/10 | Good patterns overall, but 7 files violate size limits |
| Lint Discipline | 7.0/10 | Functional but permissive — missing rules that catch real bugs |

### Findings Summary

| Severity | Count | Category |
|----------|-------|----------|
| CRITICAL | 8 | File size violations (7), immutability violations (1) |
| HIGH | 1 | Store decomposition |
| MEDIUM | 6 | Deep nesting (1), ESLint rules (4), test hygiene (1) |
| LOW | 3 | Zod alignment (1), contracts tagging (1), trace docs (1) |

---

## Section 1: File Size Violations (CRITICAL)

**Project rule**: 200-400 lines typical, 800 max (CLAUDE.md § Coding Conventions).

Seven files exceed the 800-line limit, some by 3-4x:

| # | File | Lines | Over by |
|---|------|-------|---------|
| 1 | ~~`packages/engine/src/cnl/compile-effects.ts`~~ | ~~3005~~ | ~~2205~~ | **RESOLVED** — split into 9 files (barrel + 8 modules): `compile-effects-types.ts` (41), `compile-effects-binding-scope.ts` (116), `compile-effects-utils.ts` (454), `compile-effects-core.ts` (283), `compile-effects-var.ts` (306), `compile-effects-token.ts` (363), `compile-effects-flow.ts` (826), `compile-effects-choice.ts` (345), `compile-effects-free-op.ts` (443). Barrel re-exports 4 public symbols. |
| 2 | `packages/engine/src/kernel/validate-gamedef-behavior.ts` | 2813 | 2013 |
| 3 | `packages/engine/src/cnl/compiler-core.ts` | 1909 | 1109 |
| 4 | `packages/engine/src/cnl/compile-conditions.ts` | 1837 | 1037 |
| 5 | `packages/engine/src/kernel/apply-move.ts` | 1639 | 839 |
| 6 | `packages/runner/src/model/derive-render-model.ts` | 1486 | 686 |
| 7 | `packages/runner/src/store/game-store.ts` | 1132 | 332 |

### Recommended Splits

#### 1. `compile-effects.ts` (3005 lines)

Split into 4-5 modules by effect category:

| New Module | Content | Est. Lines |
|------------|---------|------------|
| `compile-effects-core.ts` | Top-level dispatch, shared helpers, `wrapSingleEffectLowering` | ~400 |
| `compile-effects-var.ts` | `setVar`, `addVar`, `transferVar`, `aggregateVar` lowering | ~500 |
| `compile-effects-token.ts` | `moveToken`, `moveTokenAdjacent`, `createToken`, `destroyToken`, `setTokenProp` | ~500 |
| `compile-effects-flow.ts` | `forEach`, `conditional`, `repeat`, `chooseOne`, `chooseN`, `random`, `aggregate` | ~600 |
| `compile-effects-binding.ts` | `BindingScope` class + sequential binding helpers (lines 2900-3005) | ~150 |

Re-export from `compile-effects.ts` barrel for backward compatibility.

#### 2. `validate-gamedef-behavior.ts` (2813 lines)

Split by validation domain:

| New Module | Content | Est. Lines |
|------------|---------|------------|
| `validate-behavior-actions.ts` | Action validation, param validation | ~600 |
| `validate-behavior-effects.ts` | Effect AST validation | ~600 |
| `validate-behavior-conditions.ts` | Condition AST validation | ~500 |
| `validate-behavior-triggers.ts` | Trigger validation, depth checks | ~400 |
| `validate-behavior-core.ts` | Entry point, shared context, zone/token/player checks | ~500 |

#### 3. `compiler-core.ts` (1909 lines)

Split by compilation phase:

| New Module | Content | Est. Lines |
|------------|---------|------------|
| `compiler-core.ts` | Top-level `compileGameSpecToGameDef`, orchestration | ~400 |
| `compile-actions.ts` | Action compilation pipeline | ~500 |
| `compile-zones.ts` | Zone compilation, board topology | ~400 |
| `compile-players.ts` | Player/seat compilation | ~300 |

#### 4. `compile-conditions.ts` (1837 lines)

Split by condition category:

| New Module | Content | Est. Lines |
|------------|---------|------------|
| `compile-conditions-core.ts` | Dispatch, shared helpers, boolean combinators | ~400 |
| `compile-conditions-comparison.ts` | Comparison ops, value expression lowering | ~500 |
| `compile-conditions-spatial.ts` | Zone, token, adjacency conditions | ~400 |
| `compile-conditions-flow.ts` | Turn flow, phase, player conditions | ~400 |

#### 5. `apply-move.ts` (1639 lines)

Split by concern:

| New Module | Content | Est. Lines |
|------------|---------|------------|
| `apply-move.ts` | Top-level `applyMove`, pipeline orchestration | ~400 |
| `apply-move-effects.ts` | Effect execution engine | ~500 |
| `apply-move-triggers.ts` | Trigger dispatch, depth tracking | ~400 |
| `apply-move-validation.ts` | Move validation, precondition checks | ~300 |

#### 6. `derive-render-model.ts` (1486 lines)

Split by render domain:

| New Module | Content | Est. Lines |
|------------|---------|------------|
| `derive-render-model.ts` | Top-level derivation, orchestration | ~300 |
| `derive-zones.ts` | Zone render model derivation | ~400 |
| `derive-tokens.ts` | Token render model derivation | ~300 |
| `derive-players.ts` | Player/scoreboard derivation | ~300 |

#### 7. `game-store.ts` (1132 lines)

See Section 3 for store decomposition strategy.

---

## Section 2: Immutability Violations (CRITICAL)

**Project rule**: "Always create new objects, never mutate" (CLAUDE.md § Coding Conventions).

### `BindingScope` class (compile-effects.ts:2900-2994)

The `BindingScope` class uses mutable internal state:

| Line | Method | Mutation |
|------|--------|----------|
| 2911 | constructor | `this.frames.push([...frame])` |
| 2918 | constructor | `this.guardedByCondition.set(condition, new Set(bindings))` |
| 2928-2932 | `register()` | `top.push(name)` — mutates frame array |
| 2949-2955 | `registerGuarded()` | `existing.add(name)` + `this.guardedByCondition.set(...)` |
| 2967 | `withBinding()` | `this.frames.push([name])` then `this.frames.pop()` |
| 2976 | `withBindings()` | `this.frames.push([...names])` then `this.frames.pop()` |

### Recommendation

**Option A (Preferred)**: Document as an intentional exception. `BindingScope` is a compiler-internal data structure used during a single compilation pass — not kernel state. Add a `@mutable-exception` JSDoc tag and a comment explaining why immutability is waived (performance during compilation, scoped lifetime, not observable outside compilation).

**Option B**: Convert to immutable. Each mutation returns a new `BindingScope`. This is cleaner but adds allocation pressure during compilation of large specs. Benchmark before committing.

**Recommendation**: Option A — document the exception. The class has correct clone semantics already and is never shared across compilation boundaries.

---

## Section 3: Store Decomposition (HIGH)

### Problem

`GameStoreState` (game-store.ts:30-60) has 31 properties in a single interface:

```
Core game:       gameDef, gameState, playerID, gameLifecycle, loading, error
Legal moves:     legalMoveResult, selectedAction, partialMove, choiceStack
Events:          choicePending, effectTrace, triggerFirings, terminal
Animation:       animationPlaying, animationPlaybackSpeed, animationPaused,
                 animationSkipRequestToken
AI playback:     aiPlaybackDetailLevel, aiPlaybackSpeed, aiPlaybackAutoSkip,
                 aiSkipRequestToken
Orchestration:   orchestrationDiagnostic, orchestrationDiagnosticSequence
Player/UI:       playerSeats, appliedMoveEvent, appliedMoveSequence,
                 activePhaseBanner, renderModel
```

### Recommended Split

Use Zustand's slice pattern to decompose into focused slices:

| Slice | Properties | File |
|-------|-----------|------|
| `CoreGameSlice` | gameDef, gameState, playerID, gameLifecycle, loading, error, legalMoveResult, terminal | `core-game-slice.ts` |
| `MoveSlice` | selectedAction, partialMove, choiceStack, choicePending | `move-slice.ts` |
| `AnimationSlice` | animationPlaying, animationPlaybackSpeed, animationPaused, animationSkipRequestToken | `animation-slice.ts` |
| `AiPlaybackSlice` | aiPlaybackDetailLevel, aiPlaybackSpeed, aiPlaybackAutoSkip, aiSkipRequestToken | `ai-playback-slice.ts` |
| `TraceSlice` | effectTrace, triggerFirings, orchestrationDiagnostic, orchestrationDiagnosticSequence | `trace-slice.ts` |
| `UISlice` | playerSeats, appliedMoveEvent, appliedMoveSequence, activePhaseBanner, renderModel | `ui-slice.ts` |

Keep `game-store.ts` as the composition root that merges slices. Actions that touch multiple slices stay in the root or in a dedicated `game-store-actions.ts`.

---

## Section 4: Deep Nesting (MEDIUM)

### `enumerateLegalMoves` (legal-moves.ts:901-1041)

This 140-line function has 4-5 levels of nested conditionals in the main `for` loop (lines 930-1026). The deepest nesting occurs in the event-action fallback logic (lines 964-981) and the pipeline dispatch logic (lines 991-1025).

### Recommended Fix

Extract two helper functions:

1. **`resolveEventActionFallback(action, def, state, enumeration, hasActionPipeline): boolean`**
   - Encapsulates lines 964-982 (event card fallback logic)
   - Returns `true` if enumeration should `continue` to next action

2. **`enumeratePipelineAction(action, def, state, enumeration, preflight, runtime): void`**
   - Encapsulates lines 991-1025 (pipeline dispatch enumeration)
   - Extracts the viability decision and decision-sequence admission checks

This reduces the main loop body from ~96 lines to ~40 lines and eliminates the deepest nesting level.

---

## Section 5: ESLint Hardening (MEDIUM)

### Current State — **RESOLVED (CODEHEALTH-010)**

ESLint hardening implemented. Four rules added as warnings to `eslint.config.js`:

| Rule | Level | Notes |
|------|-------|-------|
| `@typescript-eslint/no-explicit-any` | `warn` | ✅ Implemented |
| `@typescript-eslint/explicit-function-return-type` | `["warn", { allowExpressions: true, allowTypedFunctionExpressions: true }]` | ✅ Implemented (note: singular `return-type`, not plural) |
| `no-param-reassign` | `warn` | ✅ Implemented as `warn` (spec said `error`, but ~7+ source files have violations — promoted to `warn` to avoid breaking build; promote to `error` in follow-up) |
| `no-console` | `["warn", { allow: ["warn", "error"] }]` | ✅ Implemented |

Two override blocks added:
1. **Test files** (`**/test/**/*.ts`, `**/*.test.ts`): `no-explicit-any` off, `explicit-function-return-type` off
2. **Runner trace** (`packages/runner/src/trace/**/*.ts`): `no-console` off

Verification: `pnpm turbo lint` passes with 0 errors, 43 warnings (all pre-existing or from new rules).

---

## Section 6: Test Hygiene (MEDIUM)

### Skipped Tests

Only 1 `.skip` marker found in the entire test suite:

| File | Line | Marker | Reason |
|------|------|--------|--------|
| `packages/engine/test/e2e/texas-holdem-tournament.test.ts` | 173 | `it.skip` | Tagged `[slow]` — intentionally skipped performance test |

**Action**: Audit whether this test should be re-enabled or moved to a dedicated `test:slow` script that runs in CI but not locally.

### Type Assertions in Tests

3 instances of `as any` in test files:

| File | Line | Usage |
|------|------|-------|
| `fitl-coin-operations.test.ts` | 887 | `(profile.legality as any)?.op` |
| `fitl-events-tutorial-simple.test.ts` | 106 | `card?.shaded?.effects?.[0] as any` |
| `fitl-events-tutorial-simple.test.ts` | 117 | `card?.shaded?.effects?.[1] as any` |

**Action**: Replace with typed narrowing helpers or proper type guards. These casts bypass type safety and can mask real type errors.

### Implementation-Detail Tests

No systematic review performed yet. Recommend a manual pass during ticket implementation to identify tests that assert on internal data structures rather than observable behavior.

---

## Section 7: Minor Fixes (LOW)

### 7.1 Zod Version Alignment

| Package | Current | Latest in repo |
|---------|---------|----------------|
| `@ludoforge/engine` | `^4.1.5` | — |
| `@ludoforge/runner` | `^4.3.6` | — |

**Action**: Align engine to `^4.3.6` to match runner. A single `pnpm -F @ludoforge/engine add zod@^4.3.6` followed by a build+test pass.

### 7.2 Contracts Module Tagging

`packages/engine/src/contracts/` contains 15 shared contract files used by both `cnl/` and `kernel/`. None have `@internal` JSDoc tags.

**Action**: Add `@internal` tags to all contract files to signal they are not part of the public API. This prevents external consumers (future CLI, evolution pipeline) from depending on internal contracts.

### 7.3 Trace Module Documentation

The `packages/engine/src/sim/` module's trace functionality is used by the runner's animation system but is not documented in CLAUDE.md's architecture table.

**Action**: No code change needed — just ensure CLAUDE.md § Architecture mentions trace as a public API surface when the next CLAUDE.md update occurs.

---

## Section 8: Ticket Quartering Plan

**Suggested ticket series prefix**: `CODEHEALTH`

| Ticket | Section | Scope | Severity | Est. Complexity |
|--------|---------|-------|----------|-----------------|
| ~~CODEHEALTH-001~~ | 1 | ~~Split `compile-effects.ts` into 5 modules~~ | ~~CRITICAL~~ | ✅ **DONE** — split into 9 files (1 barrel + 8 modules) |
| CODEHEALTH-002 | 1 | Split `validate-gamedef-behavior.ts` into 5 modules | CRITICAL | High |
| CODEHEALTH-003 | 1 | Split `compiler-core.ts` into 4 modules | CRITICAL | Medium |
| CODEHEALTH-004 | 1 | Split `compile-conditions.ts` into 4 modules | CRITICAL | Medium |
| CODEHEALTH-005 | 1 | Split `apply-move.ts` into 4 modules | CRITICAL | Medium |
| CODEHEALTH-006 | 1 | Split `derive-render-model.ts` into 4 modules | CRITICAL | Medium |
| CODEHEALTH-007 | 2 | Document `BindingScope` immutability exception | CRITICAL | Low |
| CODEHEALTH-008 | 3 | Decompose `game-store.ts` into Zustand slices | HIGH | High |
| CODEHEALTH-009 | 4 | Extract helpers from `enumerateLegalMoves` | MEDIUM | Low |
| ~~CODEHEALTH-010~~ | 5 | ~~Add ESLint rules + test overrides~~ | ~~MEDIUM~~ | ✅ **DONE** — 4 rules + 2 overrides (`no-param-reassign` at `warn` not `error`) |
| CODEHEALTH-011 | 6 | Test hygiene: fix `as any`, audit `.skip` | MEDIUM | Low |
| CODEHEALTH-012 | 7 | Zod alignment + contracts tagging + trace docs | LOW | Low |

### Dependency Graph

```
CODEHEALTH-010 (ESLint) → independent, do first to catch regressions in other tickets
CODEHEALTH-007 (BindingScope) → independent, low risk
CODEHEALTH-009 (legal-moves nesting) → independent, low risk
CODEHEALTH-011 (test hygiene) → independent
CODEHEALTH-012 (minor fixes) → independent
CODEHEALTH-001 (compile-effects) → depends on CODEHEALTH-010 (lint rules catch issues during split)
CODEHEALTH-002 (validate-behavior) → depends on CODEHEALTH-010
CODEHEALTH-003 (compiler-core) → depends on CODEHEALTH-001 (shared helpers)
CODEHEALTH-004 (compile-conditions) → depends on CODEHEALTH-010
CODEHEALTH-005 (apply-move) → depends on CODEHEALTH-010
CODEHEALTH-006 (derive-render-model) → depends on CODEHEALTH-010
CODEHEALTH-008 (store decomposition) → depends on CODEHEALTH-006 (render model split simplifies store)
```

### Recommended Execution Order

1. **Wave 1 (independent)**: 007, 009, 010, 011, 012
2. **Wave 2 (file splits — engine)**: 001, 002, 004, 005
3. **Wave 3 (file splits — compiler + runner)**: 003, 006
4. **Wave 4 (store)**: 008

## Rejection Rationale

- Rejected on 2026-03-25.
- This document is a stale point-in-time audit rather than a reliable current implementation plan.
- Parts of the audit are already obsolete or resolved, while the remaining items need targeted ownership and fresh assumption checks before implementation.
- Ongoing codebase health work should proceed through focused tickets and newer specs instead of treating this audit as an authoritative roadmap.
