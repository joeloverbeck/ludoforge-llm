# 172POLEVASTA-002: Phase 1 — route PolicyEvaluationContext layout resolution through getPolicyEncodedStateLayout

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-evaluation-core.ts` constructor; `packages/engine/src/agents/policy-eval.ts` accessor location
**Deps**: `archive/tickets/172POLEVASTA-001.md`

## Problem

The `PolicyEvaluationContext` constructor (`packages/engine/src/agents/policy-evaluation-core.ts:375`) resolves the encoded-state layout with a direct `buildEncodedStateLayout(input.def)` call:

```ts
this.encodedStateLayout = input.encodedStateLayout ?? buildEncodedStateLayout(input.def);
```

`buildEncodedStateLayout(def)` is a pure function of the `GameDef`, and `packages/engine/src/agents/policy-eval.ts` **already** maintains a per-`GameDef` `WeakMap` cache (`encodedStateLayoutCache`, `:68`) with the accessor `getPolicyEncodedStateLayout(def)` (`:320`) — but the constructor does not use it, and `microturn-option-eval.ts:113` does not thread a pre-built layout in. So every inner microturn-option evaluation rebuilds the layout from scratch. Under cube-heavy play this rebuild scales with board token count and dominates runtime (spec §2.2).

This is spec 172 §4.1: route the constructor's layout resolution through the existing per-`GameDef` accessor, fixing every current and future construction site at once.

## Assumption Reassessment (2026-05-14)

1. `policy-evaluation-core.ts:375` still reads `this.encodedStateLayout = input.encodedStateLayout ?? buildEncodedStateLayout(input.def)`. Confirmed.
2. `policy-eval.ts:68` declares `const encodedStateLayoutCache = new WeakMap<GameDef, …>()`; `:320` exports `getPolicyEncodedStateLayout(def)` which lazily populates it. Confirmed.
3. `CreatePolicyEvaluationContextInput` already declares `readonly encodedStateLayout?: EncodedStateLayout` (`policy-evaluation-core.ts:170`). The `input.encodedStateLayout ?? …` precedence must be preserved — a supplied layout still wins.
4. Mismatch + correction: `policy-eval.ts` currently imports `buildEncodedStateLayout` from `../kernel/encoded-state/index.js` and `policy-evaluation-core.ts` imports it directly too. `getPolicyEncodedStateLayout` lives in `policy-eval.ts`; `policy-evaluation-core.ts` must be able to import it. Confirm there is no `policy-eval.ts` → `policy-evaluation-core.ts` → `policy-eval.ts` import cycle; if importing the accessor from `policy-eval.ts` into `policy-evaluation-core.ts` would create one, move the accessor + its `WeakMap` to a shared module (e.g. a small `policy-encoded-state-layout-cache.ts`) and re-export from `policy-eval.ts`. Resolve this during implementation; the spec (§4.1) explicitly permits "moved to (or re-exported from) a location both can import".

## Architecture Check

1. **Cleaner than threading a layout through every call site**: fixing the constructor body fixes every present and future construction site in one place and keeps the existing `WeakMap` authoritative — no per-call-site plumbing, no risk of a new construction site forgetting to thread the layout.
2. **Agnostic boundaries preserved**: `getPolicyEncodedStateLayout` keys on `GameDef` — a generic engine structure. No game-specific branching. The module-level `WeakMap` is the spec's narrow §4.1 carve-out: a layout is a pure static implementation internal, invisible to replay / preview status / perf witnesses, and the `WeakMap` is already GC-correct (entry dies with the `GameDef`).
3. **No backwards-compat shims**: the direct `buildEncodedStateLayout` call in the constructor is **replaced** by the cached accessor, not aliased alongside it. `input.encodedStateLayout` precedence is unchanged behavior, not a compat path.

## What to Change

### 1. Make the accessor importable by `policy-evaluation-core.ts`

If `getPolicyEncodedStateLayout` + `encodedStateLayoutCache` can be imported into `policy-evaluation-core.ts` from `policy-eval.ts` without an import cycle, do that. Otherwise move both to a shared module and re-export from `policy-eval.ts` so existing `policy-eval.ts` callers are unaffected.

### 2. Route the constructor through the accessor

Change `policy-evaluation-core.ts:375` to:

```ts
this.encodedStateLayout = input.encodedStateLayout ?? getPolicyEncodedStateLayout(input.def);
```

Remove the now-unused direct `buildEncodedStateLayout` import from `policy-evaluation-core.ts` if no other use remains.

### 3. Layout-cache invariant test

Add (or extend an existing `policy-evaluation-core` test, per spec §6.2) an assertion that two `PolicyEvaluationContext` instances constructed for the same `def` (without an explicit `input.encodedStateLayout`) observe the **same** `encodedStateLayout` reference.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — constructor layout resolution; import cleanup
- `packages/engine/src/agents/policy-eval.ts` (modify) — export `getPolicyEncodedStateLayout` (and possibly relocate the accessor + `WeakMap` if a cycle forces it)
- `packages/engine/src/agents/policy-encoded-state-layout-cache.ts` (new — only if step 1 requires extracting the accessor to break a cycle)
- `packages/engine/test/unit/agents/policy-evaluation-core-layout-cache.test.ts` (new, or extend an existing `policy-evaluation-core` unit test) — layout-cache invariant

## Out of Scope

- The feature-table cache (`172POLEVASTA-003`), the runtime-owned bytecode cache (`172POLEVASTA-004`), the runtime-owned encoded-state cache (`172POLEVASTA-005`), and the constructor-no-direct-build architectural invariant (`172POLEVASTA-006`).
- Any change to `buildEncodedStateLayout` itself or the `EncodedStateLayout` type.
- Threading a pre-built layout in at `microturn-option-eval.ts:113` — unnecessary once the constructor consults the cache; explicitly avoided to keep the diff to the constructor.

## Acceptance Criteria

### Tests That Must Pass

1. Layout-cache invariant: two `PolicyEvaluationContext`s built for the same `def` observe the same `encodedStateLayout` reference.
2. Determinism gates byte-identical: `packages/engine/test/determinism/spec-140-replay-identity.test.ts`, `zobrist-incremental-parity-fitl-seed-42.test.ts` / `-seed-123.test.ts`.
3. The `172POLEVASTA-001` perf witness shows `buildEncodedStateLayout` self-time/count drop to ~0 outside first-touch (it still fails overall — the other three seams remain).
4. Existing suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/engine test:integration:fitl-rules`.

### Invariants

1. The cached/threaded layout is byte-identical to a freshly-built `buildEncodedStateLayout(def)` result — cache warmth changes nothing observable (Foundation #8).
2. `input.encodedStateLayout`, when supplied, still takes precedence over the cached accessor.
3. No game-specific branching enters `policy-evaluation-core.ts` or the accessor's host module (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-evaluation-core-layout-cache.test.ts` (new, or an extension of an existing `policy-evaluation-core` unit test) — asserts same-`def` constructions share one `encodedStateLayout` reference. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit` (targeted)
2. `pnpm -F @ludoforge/engine test:perf` (witness — `buildEncodedStateLayout` drops to first-touch-only)
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
4. `pnpm -F @ludoforge/engine test && pnpm -F @ludoforge/engine test:integration:fitl-rules`

## Outcome (2026-05-15)

Phase 1 is complete.

What landed:

- `PolicyEvaluationContext` now resolves `encodedStateLayout` through `getPolicyEncodedStateLayout(input.def)` when no explicit `input.encodedStateLayout` is supplied.
- The existing `encodedStateLayoutCache` and accessor moved from `policy-eval.ts` into `packages/engine/src/agents/policy-encoded-state-layout-cache.ts` to avoid the live `policy-eval.ts` -> `policy-evaluation-core.ts` import cycle. `policy-eval.ts` re-exports the accessor, preserving the existing source import surface.
- `packages/engine/test/unit/agents/policy-evaluation-core-layout-cache.test.ts` proves same-`GameDef` contexts observe the same cached layout reference, explicit layouts still win, and cached/explicit layouts are deep-equal to a freshly built layout.

Ticket corrections applied:

- `policy-evaluation-core.ts` cannot import `getPolicyEncodedStateLayout` directly from `policy-eval.ts` because `policy-eval.ts` imports `policy-evaluation-core.ts`; the ticket-authorized shared-module path was used.
- The Phase 1 perf witness remains a red/supplemental lane until later siblings land all rebuild seams; this ticket's owned Phase 1 signal is `buildEncodedStateLayout` first-touch-only behavior, not the whole `staticRebuildCount` threshold.

Touched-file scope:

- `packages/engine/src/agents/policy-evaluation-core.ts` — constructor layout resolution and import cleanup.
- `packages/engine/src/agents/policy-eval.ts` — accessor relocation/re-export and import cleanup.
- `packages/engine/src/agents/policy-encoded-state-layout-cache.ts` — new shared cache module, required by the live import graph.
- `packages/engine/test/unit/agents/policy-evaluation-core-layout-cache.test.ts` — new architectural-invariant unit test.
- `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` — same-series verification fallout: removed stray `@profile-variant` marker so the existing `@witness`-classified Phase 0 perf witness satisfies the live marker guard.

Generated fallout: none; `dist` was rebuilt only for compiled-test proof.

Deferred sibling/spec scope:

- `172POLEVASTA-003` owns the feature-table cache.
- `172POLEVASTA-004` owns runtime-owned compiled-bytecode cache.
- `172POLEVASTA-005` owns runtime-owned encoded-state cache.
- `172POLEVASTA-006` owns the combined constructor-no-direct-build invariant and flipping the Phase 0 perf witness to passing.

Source-size ledger:

- `packages/engine/src/agents/policy-evaluation-core.ts | before 2222 | after 2222 | crossed cap? no | active growth no | extraction/defer rationale: preexisting oversize unchanged; no separable new logic added | successor none`
- `packages/engine/src/agents/policy-eval.ts | before 1512 | after 1505 | crossed cap? no | active growth no, net extraction | extraction/defer rationale: preexisting oversize shrank by moving cache to shared module | successor none`
- `packages/engine/src/agents/policy-encoded-state-layout-cache.ts | before 0 | after 13 | crossed cap? no | active growth new small shared cache module | extraction/defer rationale: required to avoid import cycle | successor none`
- `packages/engine/test/unit/agents/policy-evaluation-core-layout-cache.test.ts | before 0 | after 146 | crossed cap? no | active growth new focused invariant test | extraction/defer rationale: not needed | successor none`
- `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts | before 99 | after 98 | crossed cap? no | active growth no, marker cleanup only | extraction/defer rationale: not needed | successor none`

Verification:

- `pnpm -F @ludoforge/engine build` passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-evaluation-core-layout-cache.test.js` passed: 2/2 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/infrastructure/test-class-markers.test.js dist/test/unit/agents/policy-evaluation-core-layout-cache.test.js` passed after the same-series marker cleanup: 3/3 tests.
- `pnpm -F @ludoforge/engine test:unit` passed after the marker cleanup: 5715/5715 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.js` remains red as expected for the full series, but Phase 1's owned signal is fixed: `buildEncodedStateLayout=1`, down from the Phase 0 recorded `4985`; remaining counts are sibling-owned (`buildFeatureTable=10617`, `buildExpressionFeatureTable=10617`, `buildEncodedState=5039`, total `26274`, threshold `4`).
- `pnpm -F @ludoforge/engine test:perf` remains red only on the same 172 Phase 0 witness, with the same Phase 1 signal: `buildEncodedStateLayout=1`; the other 4 perf suites passed.
- `pnpm -F @ludoforge/engine lint` passed.
- `pnpm -F @ludoforge/engine typecheck` passed.
- `pnpm -F @ludoforge/engine test` passed: schema artifact check passed and the default lane reported `81/81 files passed`.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` passed: `79/79 files passed`.
- `pnpm run check:ticket-deps` passed: `Ticket dependency integrity check passed for 5 active tickets and 2337 archived tickets.`

Verification substitutions:

- The root `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck` bundle was replaced with package-local engine `build`, `lint`, and `typecheck` lanes because this Phase 1 slice is engine-package-local and the package lanes prove the changed source, test, and emitted `dist` surfaces without unrelated workspace cost.
- The ticket's perf lane is classified red/supplemental for this phase rather than terminal green because `172POLEVASTA-003` through `172POLEVASTA-005` still own the other rebuild counters and `172POLEVASTA-006` owns flipping the Phase 0 witness to passing.

Late-edit proof validity:

- The same-series marker cleanup happened after the first broad `test:unit` run exposed it. The affected marker guard and focused layout-cache test were rerun together, then `test:unit` was rerun and passed.
- Terminal status/proof transcription is status and evidence only; it does not change scope, acceptance criteria, command semantics, touched-file ownership, dependency ownership, or runtime/test code.
- Dependency-check transcription is clerical; it records the just-run integrity result without changing ticket graph semantics.
